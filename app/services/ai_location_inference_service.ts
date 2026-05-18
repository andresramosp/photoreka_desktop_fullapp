import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import axios from 'axios'
import pLimit from 'p-limit'
import redis from '@adonisjs/redis/services/main'
import Photo from '#models/photo'
import User from '#models/user'
import Ws from '#services/ws'
import ModelsService from '#services/models_service'
import type { ModelName } from '#services/models_service'
import PhotoImageService from '#services/photo_image_service'
import CreditService from '#services/credit_service'
import UserCostService from '#services/user_cost_service'
import MailService from '#services/mail_service'
import PhotoManager from '../managers/photo_manager.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import { CacheInvalidationService } from './cache_invalidation_service.js'
import { aiLocationInferenceCompleteTemplate } from '../utils/email_templates.js'

type LLMProvider = 'openai' | 'gemini'
type ImageSource = 'thumbnail' | 'original'
export type LocationReliability = 'very_likely' | 'likely' | 'uncertain' | 'unknown'
export type LocationInferenceStatus = 'running' | 'completed' | 'failed'

interface AiLocationInferenceConfig {
  provider: LLMProvider
  model: ModelName
  batchSize: number
  batchConcurrency: number
  imageSource: ImageSource
  temperature: number
  maxRetries: number
  retryBaseDelayMs: number
  geocodeReliabilityThresholds: LocationReliability[]
  geocodingLanguage: string
  stateTtlSeconds: number
}

export type LocationGranularity = 'city' | 'region' | 'country'

interface LocationInferenceResult {
  id: number
  reliability: LocationReliability
  geocodeQuery: string | null
  geocodeGranularity: LocationGranularity | null
  reasoning?: string | null
}

interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress: string
  placeId?: string
}

export interface LocationInferenceJobState {
  jobId: string
  userId: number
  status: LocationInferenceStatus
  total: number
  processed: number
  located: number
  unknown: number
  uncertain: number
  geocodeMiss: number
  failed: number
  creditsCharged: number
  costEur: number
  geocodeRequests: number
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export const AI_LOCATION_INFERENCE_CONFIG: AiLocationInferenceConfig = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  batchSize: 4,
  batchConcurrency: 2,
  imageSource: 'thumbnail',
  temperature: 0.1,
  maxRetries: 3,
  retryBaseDelayMs: 1500,
  geocodeReliabilityThresholds: ['very_likely', 'likely'],
  geocodingLanguage: 'en',
  stateTtlSeconds: 60 * 60 * 24 * 7,
}

// EUR cost per photo for display estimates.
// LLM inference (Gemini Flash, batched): ~€0.000325/photo
// Geocoding (Google, ~65% locate rate): ~€0.003/photo
// 20% safety buffer applied.
const ESTIMATE_EUR_PER_PHOTO = 0.000325
const ESTIMATE_FLOOR_EUR = 0.02

const GEOCODING_REQUEST_COST_EUR = 0.0046
const RUNNING_STALE_MS = 1000 * 60 * 60 * 12

// TODO: remove before production — limits photos processed during manual testing
const TEST_PHOTO_LIMIT: number | null = null

const nowIso = () => DateTime.now().toISO() ?? new Date().toISOString()
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export default class AiLocationInferenceService {
  private modelsService = new ModelsService()
  private photoImageService = PhotoImageService.getInstance()
  private photoManager = new PhotoManager()

  /**
   * Estimate the raw EUR cost (before margin) for inferring locations on N photos.
   * Used by the estimate-credits endpoint to surface a display cost to the user.
   */
  public static estimateRawEur(photoCount: number): number {
    if (photoCount <= 0) return 0
    return Math.max(ESTIMATE_FLOOR_EUR, photoCount * ESTIMATE_EUR_PER_PHOTO)
  }

  /**
   * Estimate the credit cost shown to the user (includes commercial margin).
   */
  public static estimateCredits(photoCount: number): number {
    if (photoCount <= 0) return 0
    return CreditService.eurToCredits(CreditService.applyMargin(this.estimateRawEur(photoCount)))
  }

  public async getSummary(
    userId: number,
    currentJobId?: string
  ): Promise<{
    photosWithoutLocation: number
    estimatedCredits: number
    job: LocationInferenceJobState | null
  }> {
    const photosWithoutLocation = await this.countPhotosWithoutLocation(userId)
    const job = await this.getJob(userId)
    const visibleJob =
      job?.status === 'running' || (currentJobId && job?.jobId === currentJobId) ? job : null

    return {
      photosWithoutLocation,
      estimatedCredits: AiLocationInferenceService.estimateCredits(photosWithoutLocation),
      job: visibleJob,
    }
  }

  public async start(userId: number): Promise<LocationInferenceJobState> {
    console.log(`[AiLocationInference] start() called for userId=${userId}`)
    const existingJob = await this.getJob(userId)
    if (existingJob?.status === 'running') {
      throw new Error('A location inference process is already running.')
    }

    const photos = await this.getPhotosWithoutLocation(userId)
    console.log(
      `[AiLocationInference] Found ${photos.length} photos without location for userId=${userId}`
    )
    if (photos.length === 0) {
      throw new Error('There are no photos without location metadata.')
    }

    const job: LocationInferenceJobState = {
      jobId: crypto.randomUUID(),
      userId,
      status: 'running',
      total: photos.length,
      processed: 0,
      located: 0,
      unknown: 0,
      uncertain: 0,
      geocodeMiss: 0,
      failed: 0,
      creditsCharged: 0,
      costEur: 0,
      geocodeRequests: 0,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    }

    await this.setJob(userId, job)
    this.emitProgress(job)
    console.log(
      `[AiLocationInference] Job ${job.jobId} created and persisted, starting background run`
    )

    this.runJob(
      userId,
      job.jobId,
      photos.map((photo) => photo.id)
    ).catch(async (error) => {
      const failedJob = await this.getJob(userId)
      if (!failedJob || failedJob.jobId !== job.jobId) return

      failedJob.status = 'failed'
      failedJob.error = errorMessage(error).slice(0, 1000)
      failedJob.completedAt = nowIso()
      failedJob.updatedAt = nowIso()
      await this.setJob(userId, failedJob)
      this.emitProgress(failedJob)
    })

    return job
  }

  public async getJob(userId: number): Promise<LocationInferenceJobState | null> {
    const raw = await redis.get(this.jobKey(userId))
    if (!raw) return null

    try {
      const job = JSON.parse(raw) as LocationInferenceJobState
      if (job.status === 'running') {
        const updatedAt = DateTime.fromISO(job.updatedAt)
        if (
          updatedAt.isValid &&
          DateTime.now().diff(updatedAt).as('milliseconds') > RUNNING_STALE_MS
        ) {
          job.status = 'failed'
          job.error = 'The process did not report progress for too long.'
          job.completedAt = nowIso()
          await this.setJob(userId, job)
        }
      }
      return job
    } catch {
      return null
    }
  }

  private async runJob(userId: number, jobId: string, photoIds: number[]): Promise<void> {
    console.log(
      `[AiLocationInference] runJob() start — jobId=${jobId}, photos=${photoIds.length}, batchSize=${AI_LOCATION_INFERENCE_CONFIG.batchSize}`
    )
    const tracker = new CostTracker('location_inference')
    const trackedModels = createTrackedModelsService(this.modelsService, tracker)
    const batches = this.chunk(photoIds, AI_LOCATION_INFERENCE_CONFIG.batchSize)
    const batchLimit = pLimit(AI_LOCATION_INFERENCE_CONFIG.batchConcurrency)
    let geocodeRequests = 0
    console.log(`[AiLocationInference] Split into ${batches.length} batches`)

    await Promise.all(
      batches.map((ids) =>
        batchLimit(async () => {
          const batch = await Photo.query().whereIn('id', ids).where('user_id', userId)
          if (batch.length === 0) return
          console.log(
            `[AiLocationInference] Processing batch of ${batch.length} photos: [${batch.map((p) => p.id).join(', ')}]`
          )

          tracker.setCurrentTask('infer_location')
          let results: LocationInferenceResult[]
          try {
            results = await this.inferBatchLocations(batch, trackedModels)
          } catch (error) {
            console.warn(
              `[AiLocationInference] Batch failed (${batch.map((photo) => photo.id).join(', ')}): ${errorMessage(error)}`
            )
            results = batch.map((photo) => ({
              id: photo.id,
              reliability: 'unknown',
              geocodeQuery: null,
              geocodeGranularity: null,
              reasoning: `Batch inference failed: ${errorMessage(error).slice(0, 240)}`,
            }))
          }
          console.log(
            `[AiLocationInference] Batch LLM results: ${results.map((r) => `${r.id}=${r.reliability}(${r.geocodeQuery ?? 'no-query'})`).join(', ')}`
          )

          for (const result of results) {
            const photo = batch.find((candidate) => candidate.id === result.id)
            if (!photo) continue

            let located = false
            let failed = false
            try {
              if (this.shouldGeocode(result)) {
                geocodeRequests++
                console.log(
                  `[AiLocationInference] Geocoding photo ${photo.id} — query="${result.geocodeQuery}" (${result.reliability})`
                )
                const geocode = await this.geocode(result.geocodeQuery!)
                if (geocode) {
                  console.log(
                    `[AiLocationInference] Geocode OK photo ${photo.id} — ${geocode.formattedAddress} (${geocode.lat}, ${geocode.lng})`
                  )
                  await this.persistLocation(photo, result, geocode)
                  located = true
                } else {
                  console.log(
                    `[AiLocationInference] Geocode returned no results for photo ${photo.id} — query="${result.geocodeQuery}"`
                  )
                  await this.persistInferenceOnly(photo, result)
                }
              } else {
                console.log(
                  `[AiLocationInference] Skipping geocode for photo ${photo.id} — reliability=${result.reliability}`
                )
                await this.persistInferenceOnly(photo, result)
              }
            } catch (error) {
              failed = true
              console.warn(
                `[AiLocationInference] Could not persist result for photo ${photo.id}: ${errorMessage(error)}`
              )
            }

            const currentJob = await this.getJob(userId)
            if (!currentJob || currentJob.jobId !== jobId || currentJob.status !== 'running') return

            currentJob.processed += 1
            currentJob.geocodeRequests = geocodeRequests
            if (located) currentJob.located += 1
            else if (failed) currentJob.failed += 1
            else if (result.reliability === 'unknown') currentJob.unknown += 1
            else if (result.reliability === 'uncertain') currentJob.uncertain += 1
            else currentJob.geocodeMiss += 1
            currentJob.costEur =
              tracker.getSummary().totalCostInEur + geocodeRequests * GEOCODING_REQUEST_COST_EUR
            currentJob.updatedAt = nowIso()
            console.log(
              `[AiLocationInference] Progress: ${currentJob.processed}/${currentJob.total} | located=${currentJob.located} unknown=${currentJob.unknown} uncertain=${currentJob.uncertain} geocodeMiss=${currentJob.geocodeMiss} failed=${currentJob.failed} | costEur=${currentJob.costEur.toFixed(4)}`
            )
            await this.setJob(userId, currentJob)
            this.emitProgress(currentJob)
          }
        })
      )
    )

    const completedJob = await this.getJob(userId)
    if (!completedJob || completedJob.jobId !== jobId) return

    const costSummary = tracker.getSummary()
    console.log(
      `[AiLocationInference] Job ${jobId} completed — located=${completedJob.located}/${completedJob.total} geocodeRequests=${geocodeRequests} totalCostEur=${(costSummary.totalCostInEur + geocodeRequests * GEOCODING_REQUEST_COST_EUR).toFixed(4)}`
    )
    completedJob.costEur = costSummary.totalCostInEur + geocodeRequests * GEOCODING_REQUEST_COST_EUR
    completedJob.geocodeRequests = geocodeRequests

    // Charge the real LLM + geocoding cost with the standard commercial margin.
    if (completedJob.costEur > 0) {
      try {
        completedJob.creditsCharged = await CreditService.charge(userId, completedJob.costEur)
      } catch {}
    }

    try {
      await CacheInvalidationService.onPhotosGeolocationUpdate(String(userId))
    } catch (error) {
      console.warn(`[AiLocationInference] Cache invalidation failed: ${errorMessage(error)}`)
    }

    completedJob.status = 'completed'
    completedJob.completedAt = nowIso()
    completedJob.updatedAt = nowIso()
    await this.setJob(userId, completedJob)
    this.emitProgress(completedJob)

    UserCostService.recordFromTracker(userId, tracker, jobId).catch(() => {})
    if (geocodeRequests > 0) {
      UserCostService.record(
        userId,
        'location_inference',
        geocodeRequests * GEOCODING_REQUEST_COST_EUR,
        geocodeRequests,
        {
          model: 'google-geocoding',
          task: 'geocode_location',
          referenceId: jobId,
        }
      ).catch(() => {})
    }

    await this.notifyCompletion(completedJob)
  }

  private async inferBatchLocations(
    photos: Photo[],
    trackedModels: ModelsService
  ): Promise<LocationInferenceResult[]> {
    console.log(
      `[AiLocationInference] inferBatchLocations() — ${photos.length} photos, model=${AI_LOCATION_INFERENCE_CONFIG.model}`
    )
    const systemPrompt = `You infer the likely real-world location of photographs from visual evidence.

Return strict JSON with this shape:
{ "results": [{ "id": number, "reliability": "very_likely" | "likely" | "uncertain" | "unknown", "geocodeQuery": string | null, "geocodeGranularity": "city" | "region" | "country" | null }] }

Rules:
- Use only visible evidence: landmarks, signage, architecture, landscape, road signs, language, distinctive geography, or city-specific visual cues.
- geocodeQuery must be concise and suitable for Google Geocoding, preferably "City, Country". Use "Region, Country" only when city is not supportable. Use "Country" only when no finer granularity is supportable.
- geocodeGranularity must reflect the finest level you can confidently support: "city" for a specific city/town, "region" for a state/province/county, "country" for a country only. Set to null when geocodeQuery is null.
- Do not guess exact streets or coordinates.
- Use "very_likely" only for recognizable landmarks or highly distinctive evidence.
- Use "likely" for a defensible city/region inference.
- Use "uncertain" when you have a plausible broad place but weak evidence.
- Use "unknown" and geocodeQuery null when location cannot be inferred responsibly.
- Never invent a location just to fill the field.`

    const userContent = await this.buildVisionUserContent(photos)
    if (userContent.length <= 1) {
      return photos.map((photo) => ({
        id: photo.id,
        reliability: 'unknown',
        geocodeQuery: null,
        geocodeGranularity: null,
        reasoning: 'Image unavailable for vision inference.',
      }))
    }

    console.log(
      `[AiLocationInference] Sending vision request to LLM — ${userContent.length} content parts`
    )
    const response = await this.callLLMWithRetry(trackedModels, {
      systemPrompt,
      userContent,
      model: AI_LOCATION_INFERENCE_CONFIG.model,
      provider: AI_LOCATION_INFERENCE_CONFIG.provider,
      temperature: AI_LOCATION_INFERENCE_CONFIG.temperature,
    })
    console.log(`[AiLocationInference] LLM response received`)

    return this.normalizeResults(photos, response?.result)
  }

  private async buildVisionUserContent(photos: Photo[]): Promise<any[]> {
    const content: any[] = [
      {
        type: 'text',
        text: 'Infer the most likely geocoding query for each photo below. Return one result per id.',
      },
    ]

    const imageLimit = pLimit(3)
    const imageParts = await Promise.all(
      photos.map((photo) =>
        imageLimit(async () => ({ photo, part: await this.buildImagePart(photo) }))
      )
    )

    for (const { photo, part } of imageParts) {
      content.push({
        type: 'text',
        text: `[id:${photo.id} | filename:${photo.originalFileName || photo.name}]`,
      })
      if (part) content.push(part)
    }

    return content
  }

  private async buildImagePart(photo: Photo): Promise<any | null> {
    const useOriginal = AI_LOCATION_INFERENCE_CONFIG.imageSource === 'original'
    const url = useOriginal ? photo.originalUrl : photo.thumbnailUrl
    if (!url) return null

    // OpenAI can fetch the image directly from a URL.
    if (AI_LOCATION_INFERENCE_CONFIG.provider === 'openai') {
      return {
        type: 'image_url',
        image_url: { url, detail: 'low' },
      }
    }

    // Gemini requires inline base64 data.
    try {
      const filename = useOriginal ? photo.name : photo.thumbnailName
      if (!filename) return null

      const raw = await this.photoImageService.getImageBufferFromR2(filename)
      // Detect MIME type from the first bytes (JPEG: FF D8, PNG: 89 50, WEBP: 52 49 46 46)
      let mimeType = 'image/jpeg'
      if (raw[0] === 0x89 && raw[1] === 0x50) mimeType = 'image/png'
      else if (raw[0] === 0x52 && raw[1] === 0x49) mimeType = 'image/webp'

      return { inlineData: { mimeType, data: raw.toString('base64') } }
    } catch (error) {
      console.warn(
        `[AiLocationInference] Image unavailable for photo ${photo.id}: ${errorMessage(error)}`
      )
      return null
    }
  }

  private async callLLMWithRetry(
    trackedModels: ModelsService,
    opts: {
      systemPrompt: string
      userContent: any[]
      model: ModelName
      provider: LLMProvider
      temperature: number
    }
  ): Promise<any> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= AI_LOCATION_INFERENCE_CONFIG.maxRetries; attempt++) {
      console.log(
        `[AiLocationInference] LLM attempt ${attempt}/${AI_LOCATION_INFERENCE_CONFIG.maxRetries} — provider=${opts.provider} model=${opts.model}`
      )
      try {
        const result =
          opts.provider === 'gemini'
            ? await trackedModels.getGeminiResponse(
                opts.systemPrompt,
                opts.userContent,
                opts.model,
                { temperature: opts.temperature },
                false,
                true
              )
            : await trackedModels.getGPTResponse(
                opts.systemPrompt,
                opts.userContent,
                opts.model,
                { type: 'json_object' },
                opts.temperature,
                false
              )

        if (!result?.result) throw new Error(`LLM returned an empty response (${opts.model})`)
        return result
      } catch (error: any) {
        lastError = error
        if (attempt === AI_LOCATION_INFERENCE_CONFIG.maxRetries) break

        const delay = AI_LOCATION_INFERENCE_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1)
        console.warn(
          `[AiLocationInference] LLM attempt ${attempt}/${AI_LOCATION_INFERENCE_CONFIG.maxRetries} failed: ${errorMessage(error)}. Retrying in ${delay}ms.`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError ?? new Error('LLM location inference failed')
  }

  private normalizeResults(photos: Photo[], raw: any): LocationInferenceResult[] {
    const source = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []
    const byId = new Map<number, LocationInferenceResult>()

    for (const item of source) {
      const id = Number(item?.id)
      if (!photos.some((photo) => photo.id === id)) continue

      const reliability = this.normalizeReliability(item?.reliability)
      const rawQuery = typeof item?.geocodeQuery === 'string' ? item.geocodeQuery.trim() : ''
      const granularityRaw = item?.geocodeGranularity
      const geocodeGranularity: LocationGranularity | null = ['city', 'region', 'country'].includes(
        granularityRaw
      )
        ? granularityRaw
        : null

      byId.set(id, {
        id,
        reliability,
        geocodeQuery:
          reliability === 'unknown' || rawQuery.length === 0 ? null : rawQuery.slice(0, 160),
        geocodeGranularity: reliability === 'unknown' ? null : geocodeGranularity,
        reasoning: typeof item?.reasoning === 'string' ? item.reasoning.slice(0, 500) : null,
      })
    }

    return photos.map(
      (photo) =>
        byId.get(photo.id) ?? {
          id: photo.id,
          reliability: 'unknown',
          geocodeQuery: null,
          geocodeGranularity: null,
          reasoning: 'No usable result returned by the LLM.',
        }
    )
  }

  private normalizeReliability(value: any): LocationReliability {
    if (['very_likely', 'likely', 'uncertain', 'unknown'].includes(value)) return value
    return 'unknown'
  }

  private shouldGeocode(result: LocationInferenceResult): boolean {
    return (
      !!result.geocodeQuery &&
      AI_LOCATION_INFERENCE_CONFIG.geocodeReliabilityThresholds.includes(result.reliability)
    )
  }

  private async geocode(query: string): Promise<GeocodeResult | null> {
    const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY
    if (!key) return null

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: query,
          key,
          language: AI_LOCATION_INFERENCE_CONFIG.geocodingLanguage,
        },
        timeout: 12_000,
      })

      const first = response.data?.results?.[0]
      const location = first?.geometry?.location
      if (response.data?.status !== 'OK' || !location) return null

      return {
        lat: Number(location.lat),
        lng: Number(location.lng),
        formattedAddress: first.formatted_address,
        placeId: first.place_id,
      }
    } catch (error) {
      console.warn(`[AiLocationInference] Geocoding failed for "${query}": ${errorMessage(error)}`)
      return null
    }
  }

  private async persistLocation(
    photo: Photo,
    inference: LocationInferenceResult,
    geocode: GeocodeResult
  ): Promise<void> {
    await this.photoManager.updatePhotoDescriptions(String(photo.id), {
      EXIF: {
        gpsLatitude: geocode.lat,
        gpsLongitude: geocode.lng,
        gpsLatitudeRef: geocode.lat < 0 ? 'S' : 'N',
        gpsLongitudeRef: geocode.lng < 0 ? 'W' : 'E',
        aiLocationInference: {
          reliability: inference.reliability,
          geocodeQuery: inference.geocodeQuery,
          geocodeGranularity: inference.geocodeGranularity,
          formattedAddress: geocode.formattedAddress,
          placeId: geocode.placeId ?? null,
          reasoning: inference.reasoning ?? null,
          inferredAt: nowIso(),
        },
      },
    })
  }

  private async persistInferenceOnly(
    photo: Photo,
    inference: LocationInferenceResult
  ): Promise<void> {
    await this.photoManager.updatePhotoDescriptions(String(photo.id), {
      EXIF: {
        aiLocationExhausted: true,
        aiLocationInference: {
          reliability: inference.reliability,
          geocodeQuery: inference.geocodeQuery,
          geocodeGranularity: inference.geocodeGranularity,
          reasoning: inference.reasoning ?? null,
          inferredAt: nowIso(),
        },
      },
    })
  }

  private async countPhotosWithoutLocation(userId: number): Promise<number> {
    const photos = await this.getPhotosWithoutLocation(userId)
    return photos.length
  }

  private async getPhotosWithoutLocation(userId: number): Promise<Photo[]> {
    const query = Photo.query()
      .where('user_id', userId)
      .orderBy('id', 'desc')
      .select(['id', 'user_id', 'name', 'thumbnail_name', 'original_file_name', 'descriptions'])

    if (TEST_PHOTO_LIMIT !== null) {
      query.limit(TEST_PHOTO_LIMIT)
    }

    const photos = await query

    ///
    const exhaustedPhotoIds = photos
      .filter((photo) => this.isLocationExhausted(photo))
      .map((photo) => photo.id)
    if (exhaustedPhotoIds.length > 0) {
      console.log(
        `[AiLocationInference] Found ${exhaustedPhotoIds.length} exhausted photos: [${exhaustedPhotoIds.join(', ')}]`
      )
    }

    const alreadyLocatedPhotoIds = photos
      .filter((photo) => this.hasGpsCoordinates(photo))
      .map((photo) => photo.id)
    if (alreadyLocatedPhotoIds.length > 0) {
      console.log(
        `[AiLocationInference] Found ${alreadyLocatedPhotoIds.length} already located photos: [${alreadyLocatedPhotoIds.join(', ')}]`
      )
    }

    const photosWithoutLocation = photos.filter(
      (photo) => !this.hasGpsCoordinates(photo) && !this.isLocationExhausted(photo)
    )

    return photosWithoutLocation
  }

  private isLocationExhausted(photo: Photo): boolean {
    return (photo.descriptions as any)?.EXIF?.aiLocationExhausted === true
  }

  private hasGpsCoordinates(photo: Photo): boolean {
    const exif = (photo.descriptions as any)?.EXIF
    if (!exif) return false

    const directLat = Number(exif.gpsLatitude)
    const directLng = Number(exif.gpsLongitude)
    if (Number.isFinite(directLat) && Number.isFinite(directLng)) {
      return directLat >= -90 && directLat <= 90 && directLng >= -180 && directLng <= 180
    }

    return Array.isArray(exif.gps?.lat) && Array.isArray(exif.gps?.lng)
  }

  private async notifyCompletion(job: LocationInferenceJobState): Promise<void> {
    try {
      const user = await User.find(job.userId)
      if (!user?.email) return

      const appUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'https://app.photoreka.com'
      const mapUrl = `${appUrl.replace(/\/+$/, '')}/world-map`

      await new MailService().sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: user.email,
        subject: 'Your photo locations are ready',
        body: aiLocationInferenceCompleteTemplate(user.name ?? 'Photographer', {
          total: job.total,
          located: job.located,
          unknown: job.unknown,
          uncertain: job.uncertain,
          geocodeMiss: job.geocodeMiss,
          failed: job.failed,
          creditsCharged: job.creditsCharged,
          costEur: job.costEur,
          mapUrl,
        }),
      })
    } catch (error) {
      console.warn(`[AiLocationInference] Completion email failed: ${errorMessage(error)}`)
    }
  }

  private emitProgress(job: LocationInferenceJobState): void {
    Ws.io?.to(String(job.userId)).emit('location-inference:progress', job)
  }

  private async setJob(userId: number, job: LocationInferenceJobState): Promise<void> {
    await redis.set(
      this.jobKey(userId),
      JSON.stringify(job),
      'EX',
      AI_LOCATION_INFERENCE_CONFIG.stateTtlSeconds
    )
  }

  private jobKey(userId: number): string {
    return `location_inference:job:${userId}`
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
  }
}
