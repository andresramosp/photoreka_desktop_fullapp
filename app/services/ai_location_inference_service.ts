import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import pLimit from 'p-limit'
import GeocodingService, {
  ACTIVE_GEOCODING_PROVIDER,
  type GeocodedLocation,
} from './geocoding_service.js'
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
import { LOCATION_INFERENCE_SYSTEM_PROMPT } from '../utils/prompts/geocode.js'
import { MediaResolution } from '@google/genai'

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

export type LocationGranularity = 'place' | 'city' | 'region' | 'country'

const LOCATION_GRANULARITIES: LocationGranularity[] = ['place', 'city', 'region', 'country']

interface LocationInferenceResult {
  id: number
  reliability: LocationReliability
  geocodeQuery: string | null // composed by us from the structured fields below
  geocodeGranularity: LocationGranularity | null
  inferredPlace: string | null // world-famous landmark only (Eiffel Tower, Colosseum…)
  inferredCity: string | null
  inferredRegion: string | null
  inferredCountry: string | null // always set when any location is known
  reasoning?: string | null
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
  proximitySaved: number
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export const AI_LOCATION_INFERENCE_CONFIG: AiLocationInferenceConfig = {
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  batchSize: 4,
  batchConcurrency: 8,
  imageSource: 'thumbnail',
  temperature: 0.1,
  maxRetries: 3,
  retryBaseDelayMs: 1500,
  geocodeReliabilityThresholds: ['very_likely', 'likely', 'uncertain'],
  geocodingLanguage: 'en',
  stateTtlSeconds: 60 * 60 * 24 * 7,
}

// EUR cost per photo for display estimates.
// LLM inference (Gemini Flash, batched): ~€0.000325/photo
// Geocoding (~65% locate rate): provider cost via GeocodingService.costEurPerRequest
// 20% safety buffer applied.
const ESTIMATE_LLM_EUR_PER_PHOTO = 0.0007
const ESTIMATE_FLOOR_EUR = 0.02
const RUNNING_STALE_MS = 1000 * 60 * 60 * 12

// TODO: remove before production — limits photos processed during manual testing
const TEST_PHOTO_LIMIT: number | null = null

/** Photos taken within this window from the same camera are co-located automatically. */
const PROXIMITY_WINDOW_MS = 3 * 60 * 1000 // 3 minutes

interface PhotoProximityData {
  dateTakenMs: number | null
  cameraKey: string | null
}

interface ProximityClaim {
  geocode: GeocodedLocation
  sourcePhotoId: number
  geocodeGranularity: LocationGranularity | null
}

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
    const estimateEurPerPhoto =
      ESTIMATE_LLM_EUR_PER_PHOTO + GeocodingService.costEurPerRequest * 0.65
    return Math.max(ESTIMATE_FLOOR_EUR, photoCount * estimateEurPerPhoto)
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
      proximitySaved: 0,
      startedAt: nowIso(),
      updatedAt: nowIso(),
    }

    await this.setJob(userId, job)
    this.emitProgress(job)
    console.log(
      `[AiLocationInference] Job ${job.jobId} created and persisted, starting background run`
    )

    // Build the proximity data map once — all photo objects are already in memory.
    const photoProximityMap = new Map<number, PhotoProximityData>(
      photos.map((photo) => [photo.id, this.extractProximityData(photo)])
    )

    this.runJob(
      userId,
      job.jobId,
      photos.map((photo) => photo.id),
      photoProximityMap
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

  private async runJob(
    userId: number,
    jobId: string,
    photoIds: number[],
    photoProximityMap: Map<number, PhotoProximityData>
  ): Promise<void> {
    console.log(
      `[AiLocationInference] runJob() start — jobId=${jobId}, photos=${photoIds.length}, batchSize=${AI_LOCATION_INFERENCE_CONFIG.batchSize}`
    )
    const tracker = new CostTracker('location_inference')
    const trackedModels = createTrackedModelsService(this.modelsService, tracker)

    // Reorder photos so proximity-matched photos end up in the same batch.
    // Without this, two photos 1 second apart can be in different concurrent batches
    // and both get geocoded independently before either claims the other via proximity.
    const orderedPhotoIds = this.groupByProximityClusters(photoIds, photoProximityMap)
    const batches = this.chunk(orderedPhotoIds, AI_LOCATION_INFERENCE_CONFIG.batchSize)
    const batchLimit = pLimit(AI_LOCATION_INFERENCE_CONFIG.batchConcurrency)
    const geocodingService = new GeocodingService()
    let geocodeRequests = 0
    let paidGeocodeRequests = 0

    // Proximity state: photos claimed by a nearby already-geolocated photo.
    const proximityLocated = new Map<number, ProximityClaim>()
    // Photos whose batch iteration has already completed (processed or failed).
    const processedIds = new Set<number>()

    // Pre-match job photos against the user's already-geolocated library in DB.
    // This catches photos taken at the same time with the same camera as a photo
    // that was geolocated in a previous job — no LLM or geocoding needed for them.
    await this.preMatchWithExistingGeolocated(userId, photoIds, photoProximityMap, proximityLocated)
    if (proximityLocated.size > 0) {
      console.log(
        `[AiLocationInference] Pre-matched ${proximityLocated.size}/${photoIds.length} photo(s) against existing geolocated library`
      )
    }

    console.log(`[AiLocationInference] Split into ${batches.length} batches`)

    await Promise.all(
      batches.map((ids) =>
        batchLimit(async () => {
          const batch = await Photo.query().whereIn('id', ids).where('user_id', userId)
          if (batch.length === 0) return
          console.log(
            `[AiLocationInference] Processing batch of ${batch.length} photos: [${batch.map((p) => p.id).join(', ')}]`
          )

          // ── Proximity shortcut: skip LLM/geocoding for already-claimed photos ──
          const proximityClaimed = batch.filter((p) => proximityLocated.has(p.id))
          const toInfer = batch.filter((p) => !proximityLocated.has(p.id))

          for (const photo of proximityClaimed) {
            const claim = proximityLocated.get(photo.id)!
            console.log(
              `[AiLocationInference] Proximity shortcut photo ${photo.id} — same camera+time as photo ${claim.sourcePhotoId} → ${claim.geocode.formattedAddress}`
            )
            try {
              await this.persistProximityLocation(
                photo,
                claim.geocode,
                claim.sourcePhotoId,
                claim.geocodeGranularity
              )
            } catch (error) {
              console.warn(
                `[AiLocationInference] Could not persist proximity result for photo ${photo.id}: ${errorMessage(error)}`
              )
            }
            processedIds.add(photo.id)

            const currentJob = await this.getJob(userId)
            if (!currentJob || currentJob.jobId !== jobId || currentJob.status !== 'running') return
            currentJob.processed += 1
            currentJob.located += 1
            currentJob.proximitySaved += 1
            currentJob.geocodeRequests = geocodeRequests
            currentJob.costEur =
              tracker.getSummary().totalCostInEur +
              paidGeocodeRequests * GeocodingService.costEurPerRequest
            currentJob.updatedAt = nowIso()
            console.log(
              `[AiLocationInference] Progress: ${currentJob.processed}/${currentJob.total} | located=${currentJob.located} proximitySaved=${currentJob.proximitySaved} unknown=${currentJob.unknown} uncertain=${currentJob.uncertain} geocodeMiss=${currentJob.geocodeMiss} failed=${currentJob.failed} | costEur=${currentJob.costEur.toFixed(4)}`
            )
            await this.setJob(userId, currentJob)
            this.emitProgress(currentJob)
          }

          if (toInfer.length === 0) return

          // ── Normal path: LLM inference for unclaimed photos ──
          tracker.setCurrentTask('infer_location')
          let results: LocationInferenceResult[]
          try {
            results = await this.inferBatchLocations(toInfer, trackedModels)
          } catch (error) {
            console.warn(
              `[AiLocationInference] Batch failed (${toInfer.map((photo) => photo.id).join(', ')}): ${errorMessage(error)}`
            )
            results = toInfer.map((photo) => ({
              id: photo.id,
              reliability: 'unknown',
              geocodeQuery: null,
              geocodeGranularity: null,
              inferredPlace: null,
              inferredCity: null,
              inferredRegion: null,
              inferredCountry: null,
              reasoning: `Batch inference failed: ${errorMessage(error).slice(0, 240)}`,
            }))
          }
          console.log(
            `[AiLocationInference] Batch LLM results: ${results.map((r) => `${r.id}=${r.reliability}(${r.geocodeQuery ?? 'no-query'})`).join(', ')}`
          )

          for (const result of results) {
            const photo = toInfer.find((candidate) => candidate.id === result.id)
            if (!photo) continue

            // Late-proximity check: a concurrent batch may have geolocated a matching photo
            // while we were waiting for the LLM response.
            if (proximityLocated.has(photo.id)) {
              const claim = proximityLocated.get(photo.id)!
              console.log(
                `[AiLocationInference] Proximity shortcut (late) photo ${photo.id} — same camera+time as photo ${claim.sourcePhotoId} → ${claim.geocode.formattedAddress}`
              )
              try {
                await this.persistProximityLocation(
                  photo,
                  claim.geocode,
                  claim.sourcePhotoId,
                  claim.geocodeGranularity
                )
              } catch (error) {
                console.warn(
                  `[AiLocationInference] Could not persist proximity result for photo ${photo.id}: ${errorMessage(error)}`
                )
              }
              processedIds.add(photo.id)

              const currentJob = await this.getJob(userId)
              if (!currentJob || currentJob.jobId !== jobId || currentJob.status !== 'running')
                return
              currentJob.processed += 1
              currentJob.located += 1
              currentJob.proximitySaved += 1
              currentJob.geocodeRequests = geocodeRequests
              currentJob.costEur =
                tracker.getSummary().totalCostInEur +
                paidGeocodeRequests * GeocodingService.costEurPerRequest
              currentJob.updatedAt = nowIso()
              console.log(
                `[AiLocationInference] Progress: ${currentJob.processed}/${currentJob.total} | located=${currentJob.located} proximitySaved=${currentJob.proximitySaved} unknown=${currentJob.unknown} uncertain=${currentJob.uncertain} geocodeMiss=${currentJob.geocodeMiss} failed=${currentJob.failed} | costEur=${currentJob.costEur.toFixed(4)}`
              )
              await this.setJob(userId, currentJob)
              this.emitProgress(currentJob)
              continue
            }

            let located = false
            let failed = false
            try {
              if (this.shouldGeocode(result)) {
                geocodeRequests++
                console.log(
                  `[AiLocationInference] Geocoding photo ${photo.id} — query="${result.geocodeQuery}" (${result.reliability})`
                )
                const lookup = await geocodingService.geocode(result.geocodeQuery!, {
                  language: AI_LOCATION_INFERENCE_CONFIG.geocodingLanguage,
                  preferredCountry: result.inferredCountry ?? undefined,
                  granularity: result.geocodeGranularity,
                  structured: {
                    street: result.inferredPlace ?? undefined,
                    place: result.inferredCity ?? undefined,
                    region: result.inferredRegion ?? undefined,
                    country: result.inferredCountry ?? undefined,
                  },
                })
                paidGeocodeRequests += lookup.externalCalls
                if (lookup.result) {
                  console.log(
                    `[AiLocationInference] Geocode ${lookup.fromCache ? 'cache hit' : 'OK'} photo ${photo.id} — ${lookup.result.formattedAddress} (${lookup.result.lat}, ${lookup.result.lng})`
                  )
                  await this.persistLocation(photo, result, lookup.result)
                  located = true

                  // Register proximity matches for photos not yet processed.
                  const anchorData = photoProximityMap.get(photo.id)
                  if (anchorData) {
                    const matches = this.findProximityMatches(
                      photo.id,
                      anchorData,
                      photoIds,
                      photoProximityMap,
                      proximityLocated,
                      processedIds
                    )
                    if (matches.length > 0) {
                      for (const matchId of matches) {
                        proximityLocated.set(matchId, {
                          geocode: lookup.result,
                          sourcePhotoId: photo.id,
                          geocodeGranularity: result.geocodeGranularity,
                        })
                      }
                      console.log(
                        `[AiLocationInference] Photo ${photo.id} geolocated — queued ${matches.length} proximity match(es): [${matches.join(', ')}]`
                      )
                    }
                  }
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

            processedIds.add(photo.id)

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
              tracker.getSummary().totalCostInEur +
              paidGeocodeRequests * GeocodingService.costEurPerRequest
            currentJob.updatedAt = nowIso()
            console.log(
              `[AiLocationInference] Progress: ${currentJob.processed}/${currentJob.total} | located=${currentJob.located} proximitySaved=${currentJob.proximitySaved} unknown=${currentJob.unknown} uncertain=${currentJob.uncertain} geocodeMiss=${currentJob.geocodeMiss} failed=${currentJob.failed} | costEur=${currentJob.costEur.toFixed(4)}`
            )
            await this.setJob(userId, currentJob)
            this.emitProgress(currentJob)
          }
        })
      )
    )

    // Promote uncertain/likely photos that have a higher-reliability proximity neighbour
    // in the same job (runs after all batches so ordering during processing doesn't matter).
    try {
      const promoted = await this.runPromotionPass(userId, photoIds)
      if (promoted > 0) {
        console.log(
          `[AiLocationInference] Promotion pass: upgraded reliability of ${promoted} photo(s)`
        )
      }
    } catch (error) {
      console.warn(`[AiLocationInference] Promotion pass failed: ${errorMessage(error)}`)
    }

    const completedJob = await this.getJob(userId)
    if (!completedJob || completedJob.jobId !== jobId) return

    const costSummary = tracker.getSummary()
    console.log(
      `[AiLocationInference] Job ${jobId} completed — located=${completedJob.located}/${completedJob.total} (proximitySaved=${completedJob.proximitySaved}) geocodeRequests=${geocodeRequests} (${paidGeocodeRequests} paid, ${geocodeRequests - paidGeocodeRequests} cached) totalCostEur=${(costSummary.totalCostInEur + paidGeocodeRequests * GeocodingService.costEurPerRequest).toFixed(4)}`
    )
    completedJob.costEur =
      costSummary.totalCostInEur + paidGeocodeRequests * GeocodingService.costEurPerRequest
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
    if (paidGeocodeRequests > 0) {
      UserCostService.record(
        userId,
        'location_inference',
        paidGeocodeRequests * GeocodingService.costEurPerRequest,
        paidGeocodeRequests,
        {
          model: `${ACTIVE_GEOCODING_PROVIDER}-geocoding`,
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
    const systemPrompt = LOCATION_INFERENCE_SYSTEM_PROMPT

    const userContent = await this.buildVisionUserContent(photos)
    if (userContent.length <= 1) {
      return photos.map((photo) => ({
        id: photo.id,
        reliability: 'unknown',
        geocodeQuery: null,
        geocodeGranularity: null,
        inferredPlace: null,
        inferredCity: null,
        inferredRegion: null,
        inferredCountry: null,
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
                {
                  temperature: opts.temperature,
                  mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
                },
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

      if (reliability === 'unknown') {
        byId.set(id, {
          id,
          reliability: 'unknown',
          geocodeQuery: null,
          geocodeGranularity: null,
          inferredPlace: null,
          inferredCity: null,
          inferredRegion: null,
          inferredCountry: null,
          reasoning: typeof item?.reasoning === 'string' ? item.reasoning.slice(0, 500) : null,
        })
        continue
      }

      const inferredPlace =
        typeof item?.place === 'string' && item.place.trim()
          ? item.place.trim().slice(0, 120)
          : null
      const inferredCity =
        typeof item?.city === 'string' && item.city.trim() ? item.city.trim().slice(0, 120) : null
      const inferredRegion =
        typeof item?.region === 'string' && item.region.trim()
          ? item.region.trim().slice(0, 120)
          : null
      const inferredCountry =
        typeof item?.country === 'string' && item.country.trim()
          ? item.country.trim().slice(0, 80)
          : null

      // Derive granularity programmatically from whichever fields are populated.
      const geocodeGranularity: LocationGranularity | null = inferredPlace
        ? 'place'
        : inferredCity
          ? 'city'
          : inferredRegion
            ? 'region'
            : inferredCountry
              ? 'country'
              : null

      const geocodeQuery = this.composeGeocodeQuery(
        geocodeGranularity,
        inferredPlace,
        inferredCity,
        inferredRegion,
        inferredCountry
      )

      byId.set(id, {
        id,
        reliability,
        geocodeQuery,
        geocodeGranularity,
        inferredPlace,
        inferredCity,
        inferredRegion,
        inferredCountry,
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
          inferredPlace: null,
          inferredCity: null,
          inferredRegion: null,
          inferredCountry: null,
          reasoning: 'No usable result returned by the LLM.',
        }
    )
  }

  private composeGeocodeQuery(
    granularity: LocationGranularity | null,
    place: string | null,
    city: string | null,
    region: string | null,
    country: string | null
  ): string | null {
    if (!country) return null

    if (granularity === 'place' && place) {
      return city ? `${place}, ${city}, ${country}` : `${place}, ${country}`
    }
    if (city) return `${city}, ${country}`
    if (region) return `${region}, ${country}`
    if (granularity === 'country') return country
    return null
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

  private async persistLocation(
    photo: Photo,
    inference: LocationInferenceResult,
    geocode: GeocodedLocation
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

  public async getPhotosWithoutLocation(userId: number): Promise<Photo[]> {
    const query = Photo.query()
      .where('user_id', userId)
      .orderBy('id', 'desc')
      .preload('analyzerProcess')
      .select([
        'id',
        'user_id',
        'name',
        'thumbnail_name',
        'original_file_name',
        'descriptions',
        'analyzer_process_id',
      ])

    if (TEST_PHOTO_LIMIT !== null) {
      query.limit(TEST_PHOTO_LIMIT)
    }

    const photos = await query

    ///
    // const exhaustedPhotoIds = photos
    //   .filter((photo) => this.isLocationExhausted(photo))
    //   .map((photo) => photo.id)
    // if (exhaustedPhotoIds.length > 0) {
    //   console.log(
    //     `[AiLocationInference] Found ${exhaustedPhotoIds.length} exhausted photos: [${exhaustedPhotoIds.join(', ')}]`
    //   )
    // }

    // const alreadyLocatedPhotoIds = photos
    //   .filter((photo) => this.hasGpsCoordinates(photo))
    //   .map((photo) => photo.id)
    // if (alreadyLocatedPhotoIds.length > 0) {
    //   console.log(
    //     `[AiLocationInference] Found ${alreadyLocatedPhotoIds.length} already located photos: [${alreadyLocatedPhotoIds.join(', ')}]`
    //   )
    // }

    const photosWithoutLocation = photos.filter(
      (photo) =>
        photo.status === 'processed' &&
        !this.hasGpsCoordinates(photo) &&
        !this.isLocationExhausted(photo)
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

    // gps.lat / gps.lng can be a plain number (stored by some EXIF parsers) or a DMS array.
    if (Array.isArray(exif.gps?.lat) && Array.isArray(exif.gps?.lng)) return true

    const gpsLat = Number(exif.gps?.lat)
    const gpsLng = Number(exif.gps?.lng)
    if (Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
      return gpsLat >= -90 && gpsLat <= 90 && gpsLng >= -180 && gpsLng <= 180
    }

    return false
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

  // ---------------------------------------------------------------------------
  // Proximity optimization helpers
  // ---------------------------------------------------------------------------

  /**
   * Before any batch runs, scan the user's already-geolocated photo library and
   * pre-populate `proximityLocated` for job photos that match an existing entry
   * (same camera key + dateTaken within PROXIMITY_WINDOW_MS).
   *
   * Cost: one DB query (id + descriptions only) + O(n) in-memory scan grouped by
   * cameraKey — negligible even for large libraries.
   */
  private async preMatchWithExistingGeolocated(
    userId: number,
    jobPhotoIds: number[],
    photoProximityMap: Map<number, PhotoProximityData>,
    proximityLocated: Map<number, ProximityClaim>
  ): Promise<void> {
    const excludeSet = new Set(jobPhotoIds)

    const existingPhotos = await Photo.query()
      .where('user_id', userId)
      .select(['id', 'descriptions'])

    // Build a cameraKey → entries index to avoid O(n×m) cross-product.
    const byCameraKey = new Map<
      string,
      Array<{
        id: number
        dateTakenMs: number
        geocode: GeocodedLocation
        geocodeGranularity: LocationGranularity | null
      }>
    >()

    for (const photo of existingPhotos) {
      if (excludeSet.has(photo.id)) continue

      const exif = (photo.descriptions as any)?.EXIF
      if (!exif) continue

      // Only use photos with a flat numeric GPS (written by this service or by the client).
      const lat = Number(exif.gpsLatitude)
      const lng = Number(exif.gpsLongitude)
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      )
        continue

      // Don't use proximity-located photos as anchors — prevents cross-job transitive chains
      // where a photo located by proximity in a previous job anchors photos in the current one.
      if (exif.aiLocationInference?.proximityLocated === true) continue

      const pd = this.extractProximityData(photo)
      if (!pd.dateTakenMs || !pd.cameraKey) continue

      const geocode: GeocodedLocation = {
        lat,
        lng,
        formattedAddress: exif.aiLocationInference?.formattedAddress ?? '',
        placeId: exif.aiLocationInference?.placeId ?? null,
      }
      const granularityRaw = exif.aiLocationInference?.geocodeGranularity
      const geocodeGranularity: LocationGranularity | null = LOCATION_GRANULARITIES.includes(
        granularityRaw
      )
        ? granularityRaw
        : null

      let bucket = byCameraKey.get(pd.cameraKey)
      if (!bucket) {
        bucket = []
        byCameraKey.set(pd.cameraKey, bucket)
      }
      bucket.push({ id: photo.id, dateTakenMs: pd.dateTakenMs, geocode, geocodeGranularity })
    }

    if (byCameraKey.size === 0) return

    // Match each job photo against the indexed library.
    for (const [photoId, pd] of photoProximityMap) {
      if (!pd.dateTakenMs || !pd.cameraKey) continue
      if (proximityLocated.has(photoId)) continue

      const candidates = byCameraKey.get(pd.cameraKey)
      if (!candidates) continue

      for (const candidate of candidates) {
        if (Math.abs(candidate.dateTakenMs - pd.dateTakenMs) <= PROXIMITY_WINDOW_MS) {
          proximityLocated.set(photoId, {
            geocode: candidate.geocode,
            sourcePhotoId: candidate.id,
            geocodeGranularity: candidate.geocodeGranularity,
          })
          break
        }
      }
    }
  }

  /**
   * Parse an EXIF dateTaken string (or number) into a UTC millisecond timestamp.
   * Handles both native EXIF format ("YYYY:MM:DD HH:MM:SS") and ISO 8601.
   */
  private parseDateTakenMs(raw: string | number | null | undefined): number | null {
    if (raw == null) return null
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

    // Native EXIF: "YYYY:MM:DD HH:MM:SS" (colons as date separators)
    const exifColon = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (exifColon) {
      const ts = Date.parse(
        `${exifColon[1]}-${exifColon[2]}-${exifColon[3]}T${exifColon[4]}:${exifColon[5]}:${exifColon[6]}Z`
      )
      return isNaN(ts) ? null : ts
    }

    // Client-normalised: "YYYY-MM-DD HH:MM:SS" (space separator, no timezone)
    const isoSpace = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/)
    if (isoSpace) {
      const ts = Date.parse(`${isoSpace[1]}T${isoSpace[2]}Z`)
      return isNaN(ts) ? null : ts
    }

    const ts = Date.parse(raw)
    return isNaN(ts) ? null : ts
  }

  /**
   * Extract proximity-matching key from a photo's EXIF.
   * Returns dateTakenMs and a normalised cameraKey ("make|model").
   * Both must be non-null for proximity matching to apply.
   */
  private extractProximityData(photo: Photo): PhotoProximityData {
    const exif = (photo.descriptions as any)?.EXIF
    if (!exif) return { dateTakenMs: null, cameraKey: null }

    const dateTakenMs = this.parseDateTakenMs(exif.dateTaken)

    // Accept all known field name variants sent by different EXIF parsers / clients:
    //   - 'camera'       → single combined string (e.g. "SONY ILCE-7C")
    //   - 'make'/'Make'  → manufacturer
    //   - 'model'/'Model'→ model name
    const camera = (exif.camera ?? exif.Camera ?? '').toString().trim().toLowerCase()
    const make = (exif.make ?? exif.Make ?? '').toString().trim().toLowerCase()
    const model = (exif.model ?? exif.Model ?? '').toString().trim().toLowerCase()
    // Prefer the combined 'camera' field; fall back to make+model concatenation.
    const cameraKey = camera || make || model ? camera || `${make}|${model}` : null

    return { dateTakenMs, cameraKey }
  }

  /**
   * Given a freshly geolocated anchor photo, find all remaining photoIds that:
   *   - have dateTaken within PROXIMITY_WINDOW_MS of the anchor, AND
   *   - share the same normalised camera key.
   * Already-claimed or already-processed IDs are excluded.
   */
  private findProximityMatches(
    anchorId: number,
    anchorData: PhotoProximityData,
    allIds: number[],
    proximityMap: Map<number, PhotoProximityData>,
    alreadyClaimed: Map<number, ProximityClaim>,
    processedIds: Set<number>
  ): number[] {
    if (!anchorData.dateTakenMs || !anchorData.cameraKey) return []

    const matches: number[] = []
    for (const id of allIds) {
      if (id === anchorId) continue
      if (alreadyClaimed.has(id)) continue
      if (processedIds.has(id)) continue

      const candidate = proximityMap.get(id)
      if (!candidate?.dateTakenMs || !candidate.cameraKey) continue
      if (candidate.cameraKey !== anchorData.cameraKey) continue
      if (Math.abs(candidate.dateTakenMs - anchorData.dateTakenMs) > PROXIMITY_WINDOW_MS) continue

      matches.push(id)
    }

    return matches
  }

  /**
   * Persist GPS coordinates on a photo that was located by proximity (no LLM, no geocoding).
   * Sets aiLocationInference.proximityLocated=true and records the source photo ID.
   */
  private async persistProximityLocation(
    photo: Photo,
    geocode: GeocodedLocation,
    sourcePhotoId: number,
    geocodeGranularity: LocationGranularity | null
  ): Promise<void> {
    await this.photoManager.updatePhotoDescriptions(String(photo.id), {
      EXIF: {
        gpsLatitude: geocode.lat,
        gpsLongitude: geocode.lng,
        gpsLatitudeRef: geocode.lat < 0 ? 'S' : 'N',
        gpsLongitudeRef: geocode.lng < 0 ? 'W' : 'E',
        aiLocationInference: {
          reliability: 'very_likely',
          geocodeQuery: null,
          geocodeGranularity,
          formattedAddress: geocode.formattedAddress,
          placeId: geocode.placeId ?? null,
          reasoning: null,
          inferredAt: nowIso(),
          proximityLocated: true,
          proximitySourcePhotoId: sourcePhotoId,
        },
      },
    })
  }

  // ---------------------------------------------------------------------------

  /**
   * One tier up: uncertain → likely → very_likely. unknown and very_likely are unchanged.
   */
  private promoteReliability(r: LocationReliability): LocationReliability {
    if (r === 'uncertain') return 'likely'
    if (r === 'likely') return 'very_likely'
    return r
  }

  /**
   * After all batches complete, scan geocoded job photos grouped by cameraKey.
   * Any photo with reliability < very_likely that has a proximity neighbour with strictly
   * higher reliability gets bumped one tier (uncertain→likely, likely→very_likely).
   * Runs once — handles cases where the uncertain photo was processed before the strong anchor.
   */
  private async runPromotionPass(userId: number, jobPhotoIds: number[]): Promise<number> {
    const photos = await Photo.query()
      .whereIn('id', jobPhotoIds)
      .where('user_id', userId)
      .select(['id', 'descriptions'])

    const RANK: Record<LocationReliability, number> = {
      very_likely: 3,
      likely: 2,
      uncertain: 1,
      unknown: 0,
    }

    type GeoEntry = {
      id: number
      reliability: LocationReliability
      dateTakenMs: number
      cameraKey: string
      currentInference: Record<string, any>
    }

    const entries: GeoEntry[] = []
    for (const photo of photos) {
      const exif = (photo.descriptions as any)?.EXIF
      if (!exif) continue

      // Only consider photos that were actually geocoded in this job.
      const lat = Number(exif.gpsLatitude)
      const lng = Number(exif.gpsLongitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

      const inference = exif.aiLocationInference
      if (!inference) continue

      const reliability = this.normalizeReliability(inference.reliability)
      if (reliability === 'unknown') continue

      const pd = this.extractProximityData(photo)
      if (!pd.dateTakenMs || !pd.cameraKey) continue

      entries.push({
        id: photo.id,
        reliability,
        dateTakenMs: pd.dateTakenMs,
        cameraKey: pd.cameraKey,
        currentInference: inference,
      })
    }

    // Group by cameraKey for efficient O(k²) scan within each camera's photos.
    const byCameraKey = new Map<string, GeoEntry[]>()
    for (const entry of entries) {
      const bucket = byCameraKey.get(entry.cameraKey) ?? []
      bucket.push(entry)
      byCameraKey.set(entry.cameraKey, bucket)
    }

    let promoted = 0
    for (const bucket of byCameraKey.values()) {
      for (const entry of bucket) {
        if (entry.reliability === 'very_likely') continue

        // Nearest neighbour with strictly higher reliability within the time window.
        // Only directly-inferred photos (not proximity-located ones) can act as anchors,
        // preventing indirect reliability boosts through a proximity chain.
        const anchor = bucket.find(
          (p) =>
            p.id !== entry.id &&
            !p.currentInference.proximityLocated &&
            RANK[p.reliability] > RANK[entry.reliability] &&
            Math.abs(p.dateTakenMs - entry.dateTakenMs) <= PROXIMITY_WINDOW_MS
        )
        if (!anchor) continue

        const newReliability = this.promoteReliability(entry.reliability)
        await this.photoManager.updatePhotoDescriptions(String(entry.id), {
          EXIF: {
            aiLocationInference: {
              ...entry.currentInference,
              reliability: newReliability,
              proximityPromoted: true,
              proximityPromotedBy: anchor.id,
            },
          },
        })
        console.log(
          `[AiLocationInference] Promoted photo ${entry.id}: ${entry.reliability} → ${newReliability} (anchor: photo ${anchor.id})`
        )
        promoted++
      }
    }

    return promoted
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
  }

  /**
   * Reorders photoIds so that photos matching each other by proximity
   * (same cameraKey + dateTaken within PROXIMITY_WINDOW_MS) are placed adjacently.
   * This ensures they land in the same batch and are processed sequentially,
   * so the in-batch late-proximity check can short-circuit them correctly
   * instead of having two concurrent batches geocode them independently.
   */
  private groupByProximityClusters(
    photoIds: number[],
    proximityMap: Map<number, PhotoProximityData>
  ): number[] {
    const remaining = new Set(photoIds)
    const ordered: number[] = []

    for (const id of photoIds) {
      if (!remaining.has(id)) continue
      remaining.delete(id)
      ordered.push(id)

      const pd = proximityMap.get(id)
      if (!pd?.dateTakenMs || !pd.cameraKey) continue

      // Append all unvisited photos that match this anchor directly.
      for (const otherId of photoIds) {
        if (!remaining.has(otherId)) continue
        const otherPd = proximityMap.get(otherId)
        if (!otherPd?.dateTakenMs || !otherPd.cameraKey) continue
        if (otherPd.cameraKey !== pd.cameraKey) continue
        if (Math.abs(otherPd.dateTakenMs - pd.dateTakenMs) > PROXIMITY_WINDOW_MS) continue

        remaining.delete(otherId)
        ordered.push(otherId)
      }
    }

    return ordered
  }
}
