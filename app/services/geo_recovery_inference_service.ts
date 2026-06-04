/**
 * Standalone, anonymous-session variant of AiLocationInferenceService.
 *
 * Differences vs. ai_location_inference_service.ts (do NOT refactor that one):
 *  - No User / Photo / GeocodeCache / Credits / Email / WebSocket
 *  - No LocationGeolocatabilityService pre-filter (we accept whatever the user uploads)
 *  - No DB pre-match (no library to match against) and no promotion pass
 *  - Inputs are R2 keys (uploaded by an anonymous browser client to geo-recovery/{sessionId}/...)
 *  - Results live in Redis (per-session) instead of being persisted to DB
 *  - Cluster representatives are chosen by even distribution (we lack visual_aspects scoring)
 *
 * Reuses the same prompt, geocoding service, LLM models and clustering window
 * so the inference quality stays comparable to the main flow.
 */

import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import pLimit from 'p-limit'
import { MediaResolution } from '@google/genai'
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

import redis from '@adonisjs/redis/services/main'

import GeocodingService, {
  ACTIVE_GEOCODING_PROVIDER,
  type GeocodedLocation,
} from '#services/geocoding_service'
import ModelsService from '#services/models_service'
import type { ModelName } from '#services/models_service'
import PhotoImageService from '#services/photo_image_service'
import { LOCATION_INFERENCE_SYSTEM_PROMPT } from '../utils/prompts/geocode.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import GeoRecoveryCostService from '#services/geo_recovery_cost_service'
import GeoRecoveryPayment from '#models/geo_recovery_payment'

import GeoRecoverySessionService, {
  GEO_RECOVERY_SESSION_TTL_SECONDS,
  type GeoRecoveryPhotoEntry,
} from './geo_recovery_session_service.js'

export type LocationReliability = 'very_likely' | 'likely' | 'uncertain' | 'unknown'
export type LocationGranularity = 'place' | 'city' | 'region' | 'country'
export type GeoRecoveryJobStatus = 'running' | 'completed' | 'failed'
export type GeoRecoveryProgressStage =
  | 'preparing'
  | 'inferring'
  | 'placing'
  | 'completed'
  | 'failed'

const LOCATION_GRANULARITIES: LocationGranularity[] = ['place', 'city', 'region', 'country']

export const GEO_RECOVERY_INFERENCE_CONFIG = {
  provider: 'gemini' as 'gemini' | 'openai',
  model: 'gemini-3-flash-preview' as ModelName,
  thinkingLevel: 'MINIMAL' as 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH',
  batchSize: 4,
  batchConcurrency: 8,
  temperature: 0.1,
  maxRetries: 3,
  retryBaseDelayMs: 1500,
  geocodeReliabilityThresholds: ['very_likely', 'likely', 'uncertain'] as LocationReliability[],
  geocodingLanguage: 'en',
  proximityWindowMs: 5 * 60 * 1000,
  representativePhotosPerSlot: 5,
  requiredAgreementPercentage: 0.75,
} as const

const RUNNING_STALE_MS = 1000 * 60 * 60 * 12

// ── Public types ─────────────────────────────────────────────────────────────

export interface GeoRecoveryJobState {
  jobId: string
  sessionId: string
  status: GeoRecoveryJobStatus
  total: number
  processed: number
  located: number
  unknown: number
  uncertain: number
  geocodeMiss: number
  failed: number
  proximitySaved: number
  llmInferred: number
  progressPercent: number
  progressStage: GeoRecoveryProgressStage
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export type GeoRecoveryResult =
  | {
      clientPhotoId: string
      status: 'located'
      lat: number
      lng: number
      place: string | null
      city: string | null
      region: string | null
      formattedAddress: string | null
      placeId: string | null
      country: string | null
      geocodeQuery: string | null
      granularity: LocationGranularity | null
      reliability: LocationReliability
      source: 'llm' | 'proximity'
      sourceClientPhotoId?: string
    }
  | {
      clientPhotoId: string
      status: 'no_location'
      reliability: LocationReliability
      reasoning: string | null
    }
  | { clientPhotoId: string; status: 'failed'; error: string }

// ── Internal types ───────────────────────────────────────────────────────────

interface LlmInferenceResult {
  clientPhotoId: string
  reliability: LocationReliability
  geocodeQuery: string | null
  geocodeGranularity: LocationGranularity | null
  inferredPlace: string | null
  inferredCity: string | null
  inferredRegion: string | null
  inferredCountry: string | null
  reasoning: string | null
}

interface TemporalCluster {
  id: string
  photos: GeoRecoveryPhotoEntry[]
  representatives: GeoRecoveryPhotoEntry[]
  followers: GeoRecoveryPhotoEntry[]
}

interface RunContext {
  sessionId: string
  jobId: string
  paymentId: number | null
  geocodingService: GeocodingService
  modelsService: ModelsService
  tracker: CostTracker
  paidGeocodeRequests: number
  geocodeRequests: number
  progressQueue: ReturnType<typeof pLimit>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const nowIso = () => DateTime.now().toISO() ?? new Date().toISOString()
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function normalizeString(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function jobKey(sessionId: string): string {
  return `geo_recovery:job:${sessionId}`
}

function resultsKey(sessionId: string): string {
  return `geo_recovery:results:${sessionId}`
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Service ──────────────────────────────────────────────────────────────────

export default class GeoRecoveryInferenceService {
  private photoImageService = PhotoImageService.getInstance()
  private sessionService = new GeoRecoverySessionService()
  private s3Client = this.createS3Client()

  // ── Public API ─────────────────────────────────────────────────────────────

  public async start(sessionId: string): Promise<GeoRecoveryJobState> {
    const existing = await this.getJob(sessionId)
    if (existing?.status === 'running') {
      throw new Error('A geo recovery process is already running for this session.')
    }

    const session = await this.sessionService.load(sessionId)
    if (!session || session.photos.length === 0) {
      throw new Error('Session has no photos to process.')
    }

    const job: GeoRecoveryJobState = {
      jobId: crypto.randomUUID(),
      sessionId,
      status: 'running',
      total: session.photos.length,
      processed: 0,
      located: 0,
      unknown: 0,
      uncertain: 0,
      geocodeMiss: 0,
      failed: 0,
      proximitySaved: 0,
      llmInferred: 0,
      progressPercent: 0,
      progressStage: 'preparing',
      startedAt: nowIso(),
      updatedAt: nowIso(),
    }
    await this.setJob(job)
    // Clear any results from a previous run on this session.
    await redis.del(resultsKey(sessionId))

    // Fire-and-forget. Errors land in the job state.
    this.runJob(session.photos, job).catch(async (error) => {
      const current = await this.getJob(sessionId)
      if (!current || current.jobId !== job.jobId) return
      current.status = 'failed'
      current.progressStage = 'failed'
      current.error = errMsg(error).slice(0, 1000)
      current.completedAt = nowIso()
      current.updatedAt = nowIso()
      await this.setJob(current)
      // R2 cleanup disabled: see completeJob comment above.
      // await this.cleanupR2Files(sessionId)
    })

    return job
  }

  public async getJob(sessionId: string): Promise<GeoRecoveryJobState | null> {
    const raw = await redis.get(jobKey(sessionId))
    if (!raw) return null
    try {
      const job = JSON.parse(raw) as GeoRecoveryJobState
      if (job.status === 'running') {
        const updatedAt = DateTime.fromISO(job.updatedAt)
        if (
          updatedAt.isValid &&
          DateTime.now().diff(updatedAt).as('milliseconds') > RUNNING_STALE_MS
        ) {
          job.status = 'failed'
          job.progressStage = 'failed'
          job.error = 'The process did not report progress for too long.'
          job.completedAt = nowIso()
          await this.setJob(job)
        }
      }
      return job
    } catch {
      return null
    }
  }

  public async getResults(sessionId: string): Promise<Record<string, GeoRecoveryResult>> {
    const raw = await redis.get(resultsKey(sessionId))
    if (!raw) return {}
    try {
      return JSON.parse(raw) as Record<string, GeoRecoveryResult>
    } catch {
      return {}
    }
  }

  // ── Job runner ─────────────────────────────────────────────────────────────

  private async runJob(photos: GeoRecoveryPhotoEntry[], job: GeoRecoveryJobState): Promise<void> {
    // Get payment ID for cost tracking (prefer the session-linked paymentId)
    const session = await this.sessionService.load(job.sessionId)
    let payment: GeoRecoveryPayment | null = null
    if (session?.paymentId) {
      payment = await GeoRecoveryPayment.find(session.paymentId)
      if (payment && payment.status !== 'completed') payment = null
    }
    if (!payment) {
      payment = await GeoRecoveryPayment.query()
        .where('session_id', job.sessionId)
        .where('status', 'completed')
        .orderBy('created_at', 'desc')
        .first()
    }

    const tracker = new CostTracker('location_inference')
    const modelsService = new ModelsService()
    const trackedModels = createTrackedModelsService(modelsService, tracker)

    const context: RunContext = {
      sessionId: job.sessionId,
      jobId: job.jobId,
      paymentId: payment?.id ?? null,
      geocodingService: new GeocodingService(),
      modelsService: trackedModels,
      tracker,
      paidGeocodeRequests: 0,
      geocodeRequests: 0,
      progressQueue: pLimit(1),
    }

    const { clusters, standalone } = this.buildTemporalClusters(photos)
    const llmPhotos = [...standalone, ...clusters.flatMap((c) => c.representatives)]

    const llmResults = await this.inferLlmBatches(context, llmPhotos)

    const fallbackStandalones = await this.processClusters(context, clusters, llmResults)
    await this.processStandalones(context, standalone, llmResults)
    await this.processFallbackStandalones(context, fallbackStandalones)

    await this.completeJob(context)
  }

  // ── Clustering ─────────────────────────────────────────────────────────────

  private buildTemporalClusters(photos: GeoRecoveryPhotoEntry[]): {
    clusters: TemporalCluster[]
    standalone: GeoRecoveryPhotoEntry[]
  } {
    const dated: GeoRecoveryPhotoEntry[] = []
    const standalone: GeoRecoveryPhotoEntry[] = []
    for (const photo of photos) {
      if (typeof photo.takenAtMs === 'number') dated.push(photo)
      else standalone.push(photo)
    }
    dated.sort((a, b) => (a.takenAtMs ?? 0) - (b.takenAtMs ?? 0))

    const rawClusters: GeoRecoveryPhotoEntry[][] = []
    let bucket: GeoRecoveryPhotoEntry[] = []
    let anchor: number | null = null

    for (const photo of dated) {
      const ms = photo.takenAtMs!
      if (anchor === null) {
        anchor = ms
        bucket = [photo]
      } else if (ms - anchor <= GEO_RECOVERY_INFERENCE_CONFIG.proximityWindowMs) {
        bucket.push(photo)
      } else {
        if (bucket.length > 0) rawClusters.push(bucket)
        anchor = ms
        bucket = [photo]
      }
    }
    if (bucket.length > 0) rawClusters.push(bucket)

    const clusters: TemporalCluster[] = []
    for (const group of rawClusters) {
      if (group.length <= 1) {
        standalone.push(...group)
        continue
      }

      const repCount = Math.max(
        1,
        Math.floor(
          group.length / Math.max(1, GEO_RECOVERY_INFERENCE_CONFIG.representativePhotosPerSlot)
        )
      )
      const actualRepCount = Math.min(group.length - 1, repCount)

      // Even-distribution representative selection (we lack visual_aspects to score by quality).
      const representatives: GeoRecoveryPhotoEntry[] = []
      const followers: GeoRecoveryPhotoEntry[] = []
      const step = group.length / actualRepCount
      const repIdx = new Set<number>()
      for (let i = 0; i < actualRepCount; i++) {
        repIdx.add(Math.min(group.length - 1, Math.floor(i * step + step / 2)))
      }
      group.forEach((photo, i) => {
        if (repIdx.has(i)) representatives.push(photo)
        else followers.push(photo)
      })

      clusters.push({
        id: crypto.randomUUID(),
        photos: group,
        representatives,
        followers,
      })
    }

    return { clusters, standalone }
  }

  // ── LLM inference ──────────────────────────────────────────────────────────

  private async inferLlmBatches(
    context: RunContext,
    photos: GeoRecoveryPhotoEntry[]
  ): Promise<Map<string, LlmInferenceResult>> {
    const out = new Map<string, LlmInferenceResult>()
    if (photos.length === 0) return out

    const batches = chunk(photos, GEO_RECOVERY_INFERENCE_CONFIG.batchSize)
    const limit = pLimit(GEO_RECOVERY_INFERENCE_CONFIG.batchConcurrency)

    await Promise.all(
      batches.map((batch) =>
        limit(async () => {
          let results: LlmInferenceResult[]
          try {
            results = await this.inferBatch(context, batch)
          } catch (error) {
            results = batch.map((photo) =>
              this.unknownResult(
                photo.clientPhotoId,
                `LLM batch failed: ${errMsg(error).slice(0, 200)}`
              )
            )
          }
          for (const r of results) out.set(r.clientPhotoId, r)
          await this.updateProgress(context, {
            llmInferredDelta: batch.length,
            progressStage: 'inferring',
          })
        })
      )
    )

    return out
  }

  private async inferBatch(
    context: RunContext,
    photos: GeoRecoveryPhotoEntry[]
  ): Promise<LlmInferenceResult[]> {
    // Per-batch numeric ids for the LLM (it returns id:number); map back to clientPhotoId.
    const idMap = new Map<number, GeoRecoveryPhotoEntry>()
    photos.forEach((photo, i) => idMap.set(i + 1, photo))

    const userContent: any[] = [
      {
        type: 'text',
        text: 'Infer the most likely geocoding query for each photo below. Return one result per id.',
      },
    ]

    const imageLimit = pLimit(3)
    const imageParts = await Promise.all(
      photos.map((photo, i) =>
        imageLimit(async () => ({
          photo,
          idx: i + 1,
          part: await this.buildImagePart(photo),
        }))
      )
    )

    for (const { photo, idx, part } of imageParts) {
      userContent.push({
        type: 'text',
        text: `[id:${idx} | filename:${photo.originalName}]`,
      })
      if (part) userContent.push(part)
    }

    if (userContent.length <= 1) {
      return photos.map((photo) =>
        this.unknownResult(photo.clientPhotoId, 'Image unavailable for vision inference.')
      )
    }

    const response = await this.callLlmWithRetry(context.modelsService, userContent)
    return this.normalizeLlmResults(photos, idMap, response?.result)
  }

  private async buildImagePart(photo: GeoRecoveryPhotoEntry): Promise<any | null> {
    try {
      const raw = await this.photoImageService.getImageBufferFromR2(photo.r2Key)
      let mimeType = photo.mime || 'image/jpeg'
      if (raw[0] === 0xff && raw[1] === 0xd8) mimeType = 'image/jpeg'
      else if (raw[0] === 0x89 && raw[1] === 0x50) mimeType = 'image/png'
      else if (raw[0] === 0x52 && raw[1] === 0x49) mimeType = 'image/webp'

      if (GEO_RECOVERY_INFERENCE_CONFIG.provider === 'openai') {
        return {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${raw.toString('base64')}`, detail: 'low' },
        }
      }
      return { inlineData: { mimeType, data: raw.toString('base64') } }
    } catch (error) {
      console.warn(
        `[GeoRecovery] Image unavailable for ${photo.clientPhotoId} (${photo.r2Key}): ${errMsg(error)}`
      )
      return null
    }
  }

  private async callLlmWithRetry(models: ModelsService, userContent: any[]): Promise<any> {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= GEO_RECOVERY_INFERENCE_CONFIG.maxRetries; attempt++) {
      try {
        const result =
          GEO_RECOVERY_INFERENCE_CONFIG.provider === 'gemini'
            ? await models.getGeminiResponse(
                LOCATION_INFERENCE_SYSTEM_PROMPT,
                userContent,
                GEO_RECOVERY_INFERENCE_CONFIG.model,
                {
                  temperature: GEO_RECOVERY_INFERENCE_CONFIG.temperature,
                  mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
                },
                false,
                true,
                { thinkingLevel: GEO_RECOVERY_INFERENCE_CONFIG.thinkingLevel }
              )
            : await models.getGPTResponse(
                LOCATION_INFERENCE_SYSTEM_PROMPT,
                userContent,
                GEO_RECOVERY_INFERENCE_CONFIG.model,
                { type: 'json_object' },
                GEO_RECOVERY_INFERENCE_CONFIG.temperature,
                false
              )
        if (!result?.result) throw new Error('LLM returned an empty response')
        return result
      } catch (error: any) {
        lastError = error
        if (attempt === GEO_RECOVERY_INFERENCE_CONFIG.maxRetries) break
        const delay = GEO_RECOVERY_INFERENCE_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw lastError ?? new Error('LLM location inference failed')
  }

  private normalizeLlmResults(
    photos: GeoRecoveryPhotoEntry[],
    idMap: Map<number, GeoRecoveryPhotoEntry>,
    raw: any
  ): LlmInferenceResult[] {
    const source = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []
    const byClientId = new Map<string, LlmInferenceResult>()

    for (const item of source) {
      const numericId = Number(item?.id)
      const photo = idMap.get(numericId)
      if (!photo) continue

      const reliability = this.normalizeReliability(item?.reliability)
      if (reliability === 'unknown') {
        byClientId.set(
          photo.clientPhotoId,
          this.unknownResult(
            photo.clientPhotoId,
            typeof item?.reasoning === 'string' ? item.reasoning.slice(0, 500) : null
          )
        )
        continue
      }

      const place = this.cleanStr(item?.place, 120)
      const city = this.cleanStr(item?.city, 120)
      const region = this.cleanStr(item?.region, 120)
      const country = this.cleanStr(item?.country, 80)

      const granularity: LocationGranularity | null = place
        ? 'place'
        : city
          ? 'city'
          : region
            ? 'region'
            : country
              ? 'country'
              : null
      const geocodeQuery = this.composeGeocodeQuery(granularity, place, city, region, country)

      byClientId.set(photo.clientPhotoId, {
        clientPhotoId: photo.clientPhotoId,
        reliability,
        geocodeQuery,
        geocodeGranularity: granularity,
        inferredPlace: place,
        inferredCity: city,
        inferredRegion: region,
        inferredCountry: country,
        reasoning: typeof item?.reasoning === 'string' ? item.reasoning.slice(0, 500) : null,
      })
    }

    return photos.map(
      (photo) =>
        byClientId.get(photo.clientPhotoId) ??
        this.unknownResult(photo.clientPhotoId, 'No usable result returned by the LLM.')
    )
  }

  private unknownResult(clientPhotoId: string, reasoning: string | null): LlmInferenceResult {
    return {
      clientPhotoId,
      reliability: 'unknown',
      geocodeQuery: null,
      geocodeGranularity: null,
      inferredPlace: null,
      inferredCity: null,
      inferredRegion: null,
      inferredCountry: null,
      reasoning,
    }
  }

  private cleanStr(value: any, max: number): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, max)
  }

  private normalizeReliability(value: any): LocationReliability {
    if (LOCATION_GRANULARITIES.includes(value)) return value
    if (['very_likely', 'likely', 'uncertain', 'unknown'].includes(value)) return value
    return 'unknown'
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

  private shouldGeocode(result: LlmInferenceResult): boolean {
    return (
      !!result.geocodeQuery &&
      GEO_RECOVERY_INFERENCE_CONFIG.geocodeReliabilityThresholds.includes(result.reliability)
    )
  }

  // ── Cluster processing ─────────────────────────────────────────────────────

  private async processClusters(
    context: RunContext,
    clusters: TemporalCluster[],
    llmResults: Map<string, LlmInferenceResult>
  ): Promise<GeoRecoveryPhotoEntry[]> {
    const fallbacks: GeoRecoveryPhotoEntry[] = []

    for (const cluster of clusters) {
      const repsWithResults = cluster.representatives
        .map((photo) => {
          const result = llmResults.get(photo.clientPhotoId)
          return result ? { photo, result } : null
        })
        .filter((x): x is { photo: GeoRecoveryPhotoEntry; result: LlmInferenceResult } => !!x)

      const anchor = this.selectClusterConsensusAnchor(cluster, repsWithResults)
      const geocoded = anchor
        ? await this.tryPersistClusterConsensus(context, cluster, anchor)
        : false

      if (!geocoded) {
        for (const item of repsWithResults) {
          await this.processIndividual(context, item.photo, item.result)
        }
        for (const follower of cluster.followers) fallbacks.push(follower)
      }
    }

    return fallbacks
  }

  private selectClusterConsensusAnchor(
    cluster: TemporalCluster,
    reps: { photo: GeoRecoveryPhotoEntry; result: LlmInferenceResult }[]
  ): { photo: GeoRecoveryPhotoEntry; result: LlmInferenceResult } | null {
    const apt = reps.filter((item) => {
      const r = item.result
      const isAptGranularity = r.geocodeGranularity === 'place' || r.geocodeGranularity === 'city'
      const isReliable = r.reliability === 'very_likely'
      return isReliable && isAptGranularity
    })

    const originalCount = cluster.representatives.length
    const aptRatio = apt.length / originalCount
    if (aptRatio < GEO_RECOVERY_INFERENCE_CONFIG.requiredAgreementPercentage || apt.length === 0) {
      return null
    }

    const first = apt[0].result
    const firstCountry = normalizeString(first.inferredCountry)
    const firstCity = normalizeString(first.inferredCity)
    const allAgree = apt.every(
      (item) =>
        normalizeString(item.result.inferredCountry) === firstCountry &&
        normalizeString(item.result.inferredCity) === firstCity
    )
    if (!allAgree) return null

    // Prefer 'place' over 'city' for the anchor.
    const sorted = [...apt].sort((a, b) => {
      const aRank = a.result.geocodeGranularity === 'place' ? 2 : 1
      const bRank = b.result.geocodeGranularity === 'place' ? 2 : 1
      return bRank - aRank
    })
    return sorted[0] ?? null
  }

  private async tryPersistClusterConsensus(
    context: RunContext,
    cluster: TemporalCluster,
    anchor: { photo: GeoRecoveryPhotoEntry; result: LlmInferenceResult }
  ): Promise<boolean> {
    const { photo, result } = anchor
    if (!this.shouldGeocode(result)) return false

    let geo: GeocodedLocation | null = null
    try {
      const lookup = await context.geocodingService.geocode(result.geocodeQuery!, {
        language: GEO_RECOVERY_INFERENCE_CONFIG.geocodingLanguage,
        preferredCountry: result.inferredCountry ?? undefined,
        granularity: result.geocodeGranularity,
        structured: {
          street: result.inferredPlace ?? undefined,
          place: result.inferredCity ?? undefined,
          region: result.inferredRegion ?? undefined,
          country: result.inferredCountry ?? undefined,
        },
      })

      // Track geocoding requests
      context.geocodeRequests += 1
      if (!lookup.fromCache) {
        context.paidGeocodeRequests += lookup.externalCalls
      }

      geo = lookup.result
    } catch (error) {
      console.warn(`[GeoRecovery] Cluster geocode failed: ${errMsg(error)}`)
      return false
    }

    if (!geo) return false

    await this.recordLocated(context, photo, result, geo, 'llm')
    await this.updateProgress(context, {
      processedDelta: 1,
      locatedDelta: 1,
      progressStage: 'placing',
    })

    for (const companion of cluster.photos) {
      if (companion.clientPhotoId === photo.clientPhotoId) continue
      try {
        await this.recordProximityLocated(context, companion, photo, result, geo)
        await this.updateProgress(context, {
          processedDelta: 1,
          locatedDelta: 1,
          proximitySavedDelta: 1,
          progressStage: 'placing',
        })
      } catch (error) {
        console.warn(
          `[GeoRecovery] Could not propagate to ${companion.clientPhotoId}: ${errMsg(error)}`
        )
        await this.updateProgress(context, {
          processedDelta: 1,
          failedDelta: 1,
          progressStage: 'placing',
        })
      }
    }

    return true
  }

  // ── Standalone processing ─────────────────────────────────────────────────

  private async processStandalones(
    context: RunContext,
    standalone: GeoRecoveryPhotoEntry[],
    llmResults: Map<string, LlmInferenceResult>
  ): Promise<void> {
    for (const photo of standalone) {
      const result = llmResults.get(photo.clientPhotoId)
      if (!result) continue
      await this.processIndividual(context, photo, result)
    }
  }

  private async processFallbackStandalones(
    context: RunContext,
    photos: GeoRecoveryPhotoEntry[]
  ): Promise<void> {
    if (photos.length === 0) return
    const batches = chunk(photos, GEO_RECOVERY_INFERENCE_CONFIG.batchSize)
    for (const batch of batches) {
      let results: LlmInferenceResult[]
      try {
        results = await this.inferBatch(context, batch)
      } catch (error) {
        results = batch.map((p) =>
          this.unknownResult(p.clientPhotoId, `Fallback failed: ${errMsg(error).slice(0, 200)}`)
        )
      }
      await this.updateProgress(context, {
        llmInferredDelta: batch.length,
        progressStage: 'inferring',
      })
      for (const result of results) {
        const photo = batch.find((p) => p.clientPhotoId === result.clientPhotoId)
        if (!photo) continue
        await this.processIndividual(context, photo, result)
      }
    }
  }

  private async processIndividual(
    context: RunContext,
    photo: GeoRecoveryPhotoEntry,
    result: LlmInferenceResult
  ): Promise<void> {
    let located = false
    let failed = false

    try {
      if (this.shouldGeocode(result)) {
        const lookup = await context.geocodingService.geocode(result.geocodeQuery!, {
          language: GEO_RECOVERY_INFERENCE_CONFIG.geocodingLanguage,
          preferredCountry: result.inferredCountry ?? undefined,
          granularity: result.geocodeGranularity,
          structured: {
            street: result.inferredPlace ?? undefined,
            place: result.inferredCity ?? undefined,
            region: result.inferredRegion ?? undefined,
            country: result.inferredCountry ?? undefined,
          },
        })

        // Track geocoding requests
        context.geocodeRequests += 1
        if (!lookup.fromCache) {
          context.paidGeocodeRequests += lookup.externalCalls
        }

        if (lookup.result) {
          await this.recordLocated(context, photo, result, lookup.result, 'llm')
          located = true
        } else {
          await this.recordNoLocation(context, photo, result)
        }
      } else {
        await this.recordNoLocation(context, photo, result)
      }
    } catch (error) {
      failed = true
      await this.recordFailed(context, photo, errMsg(error))
    }

    await this.updateProgress(context, {
      processedDelta: 1,
      ...this.getOutcomeDelta(result, located, failed),
      progressStage: 'placing',
    })
  }

  private getOutcomeDelta(result: LlmInferenceResult, located: boolean, failed: boolean) {
    if (located) return { locatedDelta: 1 }
    if (failed) return { failedDelta: 1 }
    if (result.reliability === 'unknown') return { unknownDelta: 1 }
    if (result.reliability === 'uncertain') return { uncertainDelta: 1 }
    return { geocodeMissDelta: 1 }
  }

  // ── Result persistence (Redis) ─────────────────────────────────────────────

  private async recordLocated(
    context: RunContext,
    photo: GeoRecoveryPhotoEntry,
    inference: LlmInferenceResult,
    geo: GeocodedLocation,
    source: 'llm'
  ): Promise<void> {
    await this.writeResult(context.sessionId, {
      clientPhotoId: photo.clientPhotoId,
      status: 'located',
      lat: geo.lat,
      lng: geo.lng,
      place: inference.inferredPlace ?? null,
      city: inference.inferredCity ?? null,
      region: inference.inferredRegion ?? null,
      formattedAddress: geo.formattedAddress ?? null,
      placeId: geo.placeId ?? null,
      country: geo.country ?? inference.inferredCountry ?? null,
      geocodeQuery: inference.geocodeQuery,
      granularity: inference.geocodeGranularity,
      reliability: inference.reliability,
      source,
    })
  }

  private async recordProximityLocated(
    context: RunContext,
    companion: GeoRecoveryPhotoEntry,
    anchor: GeoRecoveryPhotoEntry,
    anchorInference: LlmInferenceResult,
    geo: GeocodedLocation
  ): Promise<void> {
    await this.writeResult(context.sessionId, {
      clientPhotoId: companion.clientPhotoId,
      status: 'located',
      lat: geo.lat,
      lng: geo.lng,
      place: anchorInference.inferredPlace ?? null,
      city: anchorInference.inferredCity ?? null,
      region: anchorInference.inferredRegion ?? null,
      formattedAddress: geo.formattedAddress ?? null,
      placeId: geo.placeId ?? null,
      country: geo.country ?? anchorInference.inferredCountry ?? null,
      geocodeQuery: anchorInference.geocodeQuery,
      granularity: anchorInference.geocodeGranularity,
      reliability: 'very_likely',
      source: 'proximity',
      sourceClientPhotoId: anchor.clientPhotoId,
    })
  }

  private async recordNoLocation(
    context: RunContext,
    photo: GeoRecoveryPhotoEntry,
    result: LlmInferenceResult
  ): Promise<void> {
    await this.writeResult(context.sessionId, {
      clientPhotoId: photo.clientPhotoId,
      status: 'no_location',
      reliability: result.reliability,
      reasoning: result.reasoning,
    })
  }

  private async recordFailed(
    context: RunContext,
    photo: GeoRecoveryPhotoEntry,
    error: string
  ): Promise<void> {
    await this.writeResult(context.sessionId, {
      clientPhotoId: photo.clientPhotoId,
      status: 'failed',
      error: error.slice(0, 500),
    })
  }

  private async writeResult(sessionId: string, result: GeoRecoveryResult): Promise<void> {
    // Read-modify-write under per-process lock — safe given progressQueue serialises calls.
    const raw = await redis.get(resultsKey(sessionId))
    const map: Record<string, GeoRecoveryResult> = raw ? JSON.parse(raw) : {}
    map[result.clientPhotoId] = result
    await redis.set(
      resultsKey(sessionId),
      JSON.stringify(map),
      'EX',
      GEO_RECOVERY_SESSION_TTL_SECONDS
    )
  }

  // ── Progress / completion ──────────────────────────────────────────────────

  private async updateProgress(
    context: RunContext,
    delta: {
      processedDelta?: number
      locatedDelta?: number
      proximitySavedDelta?: number
      unknownDelta?: number
      uncertainDelta?: number
      geocodeMissDelta?: number
      failedDelta?: number
      llmInferredDelta?: number
      progressStage?: GeoRecoveryProgressStage
    }
  ): Promise<void> {
    await context.progressQueue(async () => {
      const job = await this.getJob(context.sessionId)
      if (!job || job.jobId !== context.jobId || job.status !== 'running') return

      const bump = (key: keyof GeoRecoveryJobState, by: number | undefined) => {
        if (!by) return
        const next = (job[key] as number) + by
        ;(job as any)[key] = Math.min(Math.max(0, Math.floor(next)), job.total)
      }

      bump('processed', delta.processedDelta)
      bump('located', delta.locatedDelta)
      bump('proximitySaved', delta.proximitySavedDelta)
      bump('unknown', delta.unknownDelta)
      bump('uncertain', delta.uncertainDelta)
      bump('geocodeMiss', delta.geocodeMissDelta)
      bump('failed', delta.failedDelta)
      bump('llmInferred', delta.llmInferredDelta)

      if (delta.progressStage) job.progressStage = delta.progressStage
      job.updatedAt = nowIso()
      job.progressPercent = this.calcProgressPercent(job)
      await this.setJob(job)
    })
  }

  private calcProgressPercent(job: GeoRecoveryJobState): number {
    if (job.status === 'completed') return 100
    if (job.total <= 0) return job.progressPercent
    const processed = Math.min(job.processed, job.total)
    const inferredAhead = Math.min(
      Math.max(0, job.llmInferred - processed),
      Math.max(0, job.total - processed)
    )
    const weighted = processed + inferredAhead * 0.35
    const calculated = Math.round((weighted / job.total) * 100)
    const capped = job.status === 'running' ? Math.min(99, calculated) : calculated
    return Math.max(job.progressPercent, capped)
  }

  private async completeJob(context: RunContext): Promise<void> {
    const job = await this.getJob(context.sessionId)
    if (!job || job.jobId !== context.jobId) return

    // Record costs to database if payment exists
    if (context.paymentId) {
      try {
        // Record LLM costs
        await GeoRecoveryCostService.recordFromTracker(
          context.paymentId,
          context.tracker,
          context.jobId
        ).catch(() => {})

        // Record geocoding costs
        if (context.paidGeocodeRequests > 0) {
          await GeoRecoveryCostService.record(
            context.paymentId,
            'location_inference',
            context.paidGeocodeRequests * GeocodingService.costEurPerRequest,
            context.paidGeocodeRequests,
            {
              model: `${ACTIVE_GEOCODING_PROVIDER}-geocoding`,
              task: 'geocode_location',
              referenceId: context.jobId,
            }
          ).catch(() => {})
        }

        // Log cost summary
        const costSummary = context.tracker.getSummary()
        const llmCostEur = costSummary.totalCostInEur
        const geocodingCostEur = context.paidGeocodeRequests * GeocodingService.costEurPerRequest
        const totalCostEur = llmCostEur + geocodingCostEur

        console.log(
          `[GeoRecovery] ══════════════════════════ JOB SUMMARY ══════════════════════════`
        )
        console.log(`[GeoRecovery] Job ${context.jobId} — COMPLETED`)
        console.log(
          `[GeoRecovery]   Photos       : total=${job.total} | located=${job.located} | unknown=${job.unknown} | uncertain=${job.uncertain} | failed=${job.failed}`
        )
        console.log(
          `[GeoRecovery]   Clustering   : proximitySaved=${job.proximitySaved} | llmInferred=${job.llmInferred}`
        )
        console.log(
          `[GeoRecovery]   Geocoding    : ${context.geocodeRequests} requests total (${context.paidGeocodeRequests} paid / ${context.geocodeRequests - context.paidGeocodeRequests} cached)`
        )
        console.log(
          `[GeoRecovery]   Cost         : €${totalCostEur.toFixed(4)} total | LLM €${llmCostEur.toFixed(4)} | geocoding €${geocodingCostEur.toFixed(4)}`
        )
        console.log(
          `[GeoRecovery] ═══════════════════════════════════════════════════════════════════`
        )
      } catch (error) {
        console.warn(`[GeoRecovery] Error recording costs: ${errMsg(error)}`)
      }
    }

    job.status = 'completed'
    job.progressStage = 'completed'
    job.progressPercent = 100
    job.completedAt = nowIso()
    job.updatedAt = nowIso()
    await this.setJob(job)
    // R2 cleanup disabled: photos are kept for support/refund traceability.
    // A Cloudflare R2 lifecycle rule on prefix geo-recovery/ handles expiry after N days.
    // await this.cleanupR2Files(context.sessionId)
  }

  private async setJob(job: GeoRecoveryJobState): Promise<void> {
    await redis.set(
      jobKey(job.sessionId),
      JSON.stringify(job),
      'EX',
      GEO_RECOVERY_SESSION_TTL_SECONDS
    )
  }

  // ── R2 cleanup ─────────────────────────────────────────────────────────────

  private createS3Client(): S3Client {
    return new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  private async cleanupR2Files(sessionId: string): Promise<void> {
    try {
      const prefix = `geo-recovery/${sessionId}/`
      const bucket = process.env.R2_BUCKET
      if (!bucket) {
        console.warn('[GeoRecovery] R2_BUCKET not configured; skipping cleanup')
        return
      }

      // List all objects under the session prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 5000, // Safeguard; GEO_RECOVERY_MAX_PHOTOS_PER_SESSION is 5000
      })

      const listResult = await this.s3Client.send(listCommand)
      const keys = listResult.Contents?.map((obj) => ({ Key: obj.Key! })) ?? []

      if (keys.length === 0) {
        console.info(`[GeoRecovery] No R2 files to clean up for session ${sessionId}`)
        return
      }

      // Delete all objects for this session
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys },
      })

      const deleteResult = await this.s3Client.send(deleteCommand)
      const deleted = deleteResult.Deleted?.length ?? 0
      const errors = deleteResult.Errors?.length ?? 0

      if (errors > 0) {
        console.warn(
          `[GeoRecovery] Deleted ${deleted} R2 files for session ${sessionId}; ${errors} errors occurred`
        )
      } else {
        console.info(
          `[GeoRecovery] Successfully deleted ${deleted} R2 files for session ${sessionId}`
        )
      }
    } catch (error) {
      console.error(
        `[GeoRecovery] R2 cleanup failed for session ${sessionId}:`,
        error instanceof Error ? error.message : String(error)
      )
      // Do not re-throw; cleanup failure should not crash the job completion flow
    }
  }
}
