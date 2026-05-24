import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import pLimit from 'p-limit'
import GeocodingService, {
  ACTIVE_GEOCODING_PROVIDER,
  type GeocodedLocation,
} from './geocoding_service.js'
import redis from '@adonisjs/redis/services/main'
import db from '@adonisjs/lucid/services/db'
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
import LocationGeolocatabilityService, {
  type GeolocatabilityAssessment,
} from './location_geolocatability_service.js'

type LLMProvider = 'openai' | 'gemini'
type ImageSource = 'thumbnail' | 'original'
export type LocationReliability = 'very_likely' | 'likely' | 'uncertain' | 'unknown'
export type LocationInferenceStatus = 'running' | 'completed' | 'failed'
export type LocationInferenceProgressStage =
  | 'preparing'
  | 'matching'
  | 'inferring'
  | 'placing'
  | 'completed'
  | 'failed'

interface ProximityClusterConfig {
  proximityWindowMs: number
  representativeRatio: number
  minRepresentatives: number
  maxRepresentatives: number
  requiredAgreementPercentage: number
}

export const PROXIMITY_CLUSTER_CONFIG: ProximityClusterConfig = {
  proximityWindowMs: 5 * 60 * 1000, // 3 minutes
  representativeRatio: 0.1, // 10% of cluster photos
  minRepresentatives: 3, // minimum reps to attempt consensus
  maxRepresentatives: 5, // maximum reps to avoid bloating
  requiredAgreementPercentage: 0.75, // 75% of valid reps must agree on country + city
}

interface AiLocationInferenceConfig {
  provider: LLMProvider
  model: ModelName
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
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
  llmInferred: number
  progressPercent: number
  progressStage: LocationInferenceProgressStage
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export const AI_LOCATION_INFERENCE_CONFIG: AiLocationInferenceConfig = {
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  thinkingLevel: 'MINIMAL',
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
const ESTIMATE_LLM_EUR_PER_PHOTO = 0.0008
const ESTIMATE_FLOOR_EUR = 0.02

// Clustering + DB pre-match model constants used for the optimistic (min) cost estimate.
// Max estimate assumes zero savings (every photo goes through LLM + geocoding individually).
const ESTIMATE_CLUSTER_RATIO = 0.3 // ~30% of photos are expected to form temporal clusters
const ESTIMATE_FOLLOWER_RATIO = 0.5 // ~50% of photos within a cluster are followers
const ESTIMATE_CLUSTER_SUCCESS_RATE = 0.7 // ~70% of clusters achieve consensus + geocode OK
const ESTIMATE_AVG_CLUSTER_SIZE = 6 // average photos per cluster (geocode amortization)
const ESTIMATE_GEOCODE_LOCATE_RATE = 0.65 // ~65% of individual geocode requests resolve
const ESTIMATE_DB_PREMATCH_RATIO = 0.08 // ~8% of photos may match an already-geolocated photo in the library (returning users)
const RUNNING_STALE_MS = 1000 * 60 * 60 * 12

interface PhotoProximityData {
  dateTakenMs: number | null
  cameraKey: string | null
}

interface ProximityClaim {
  geocode: GeocodedLocation
  sourcePhotoId: number
  geocodeGranularity: LocationGranularity | null
  /** geocode_cache.id for the row backing this location (null for real-GPS or pre-migration anchors). */
  cacheId: number | null
}

interface TemporalCluster {
  id: string
  photos: Photo[]
  representatives: Photo[]
  followers: Photo[]
}

interface LocationInferenceRunContext {
  userId: number
  jobId: string
  tracker: CostTracker
  trackedModels: ModelsService
  geocodingService: GeocodingService
  geocodeRequests: number
  paidGeocodeRequests: number
  // Stats for final summary log
  dbPreMatchedCount: number
  clusterCount: number
  standaloneCount: number
  llmPhotoCount: number
  progressQueue: ReturnType<typeof pLimit>
}

interface LocationInferenceProgressDelta {
  processedDelta?: number
  locatedDelta?: number
  proximitySavedDelta?: number
  unknownDelta?: number
  uncertainDelta?: number
  geocodeMissDelta?: number
  failedDelta?: number
  llmInferredDelta?: number
  progressStage?: LocationInferenceProgressStage
}

const nowIso = () => DateTime.now().toISO() ?? new Date().toISOString()
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const clampProgressCount = (value: number | null | undefined, max: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(0, Math.floor(value as number)), Math.max(0, max))
}

export default class AiLocationInferenceService {
  private modelsService = new ModelsService()
  private photoImageService = PhotoImageService.getInstance()
  private photoManager = new PhotoManager()

  /**
   * Pessimistic LLM estimate used for guards and the displayed max bound.
   *
   * The fixed EUR/photo constant was calibrated from real batched Gemini runs,
   * so the pessimistic case needs to price the last partial batch as a full one
   * instead of assuming perfect linearity photo-by-photo.
   */
  private static estimateWorstCaseLlmEur(photoCount: number): number {
    if (photoCount <= 0) return 0

    const billedBatchSlots =
      Math.ceil(photoCount / AI_LOCATION_INFERENCE_CONFIG.batchSize) *
      AI_LOCATION_INFERENCE_CONFIG.batchSize

    return billedBatchSlots * ESTIMATE_LLM_EUR_PER_PHOTO
  }

  /**
   * Estimate the raw EUR cost (before margin) for inferring locations on N photos.
   * Used by the estimate-credits endpoint to surface a display cost to the user.
   */
  public static estimateRawEur(photoCount: number): number {
    if (photoCount <= 0) return 0

    const worstCaseLlmEur = this.estimateWorstCaseLlmEur(photoCount)
    const worstCaseGeocodeEur = photoCount * GeocodingService.costEurPerRequest * 0.65

    return Math.max(ESTIMATE_FLOOR_EUR, worstCaseLlmEur + worstCaseGeocodeEur)
  }

  /**
   * Estimate the credit cost shown to the user (includes commercial margin).
   * Returns the pessimistic (max) value — used for the canAfford guard.
   */
  public static estimateCredits(photoCount: number): number {
    if (photoCount <= 0) return 0
    return CreditService.eurToCredits(CreditService.applyMargin(this.estimateRawEur(photoCount)))
  }

  /**
   * Estimate a [min, max] EUR cost range accounting for potential clustering and DB pre-match savings.
   *
   * Max  — pessimistic: no savings, every photo goes through individual LLM + geocoding.
   * Min  — optimistic: realistic cluster success rate + conservative DB pre-match savings.
   *
   * Clustering model (min):
   *   - ~60% of photos are expected to form temporal clusters (have dateTaken).
   *   - Within each cluster ~80% are followers (1 rep per 5 photos).
   *   - ~70% of clusters succeed (consensus + geocode OK) → those followers pay nothing.
   *   - Failed clusters dissolve → all photos pay individually.
   *   - Geocoding for successful clusters is amortized (1 call per ~6 photos).
   * DB pre-match model (min):
   *   - ~8% of photos are expected to match an already-geolocated photo in the library
   *     (conservative estimate for returning users; first-time users pay the full min).
   */
  public static estimateRawEurRange(photoCount: number): { min: number; max: number } {
    if (photoCount <= 0) return { min: 0, max: 0 }

    const geocodeEur = GeocodingService.costEurPerRequest

    // ── Max: no savings assumed. All photos need LLM, and the final partial batch
    // is priced pessimistically as a full batch because the observed fixed EUR/photo
    // was calibrated from batched real runs rather than isolated single-photo calls. ──
    const maxEur = Math.max(
      ESTIMATE_FLOOR_EUR,
      this.estimateWorstCaseLlmEur(photoCount) +
        photoCount * geocodeEur * ESTIMATE_GEOCODE_LOCATE_RATE
    )

    // ── Min: clustering + DB pre-match savings applied ──

    // Step 1 — DB pre-match: some photos skip everything via library match.
    const effectivePhotos = photoCount * (1 - ESTIMATE_DB_PREMATCH_RATIO)

    // Step 2 — Clustering split.
    const clusteredPhotos = effectivePhotos * ESTIMATE_CLUSTER_RATIO
    const standalonePhotos = effectivePhotos - clusteredPhotos

    // Step 3 — Within clustered photos, followers of successful clusters pay nothing.
    const savedFollowers = clusteredPhotos * ESTIMATE_FOLLOWER_RATIO * ESTIMATE_CLUSTER_SUCCESS_RATE
    const individualFromClusters = clusteredPhotos - savedFollowers

    // Step 4 — LLM cost: standalones + non-saved cluster photos all need LLM.
    const effectiveLlmPhotos = standalonePhotos + individualFromClusters
    const llmCost = effectiveLlmPhotos * ESTIMATE_LLM_EUR_PER_PHOTO

    // Step 5 — Geocoding cost.
    // Successful clusters: 1 geocode request shared across the whole cluster.
    const numClusters = clusteredPhotos / ESTIMATE_AVG_CLUSTER_SIZE
    const geocodeCostSuccessfulClusters = numClusters * ESTIMATE_CLUSTER_SUCCESS_RATE * geocodeEur
    // Failed cluster photos + standalones: pay individual geocode at the normal locate rate.
    const failedClusterPhotos = clusteredPhotos * (1 - ESTIMATE_CLUSTER_SUCCESS_RATE)
    const geocodeCostIndividual =
      (standalonePhotos + failedClusterPhotos) * ESTIMATE_GEOCODE_LOCATE_RATE * geocodeEur
    const geocodeCost = geocodeCostSuccessfulClusters + geocodeCostIndividual

    const minEur = Math.max(ESTIMATE_FLOOR_EUR, llmCost + geocodeCost)

    return { min: minEur, max: maxEur }
  }

  /**
   * Credit range shown to the user (includes commercial margin).
   */
  public static estimateCreditsRange(photoCount: number): { min: number; max: number } {
    if (photoCount <= 0) return { min: 0, max: 0 }
    const raw = this.estimateRawEurRange(photoCount)
    return {
      min: CreditService.eurToCredits(CreditService.applyMargin(raw.min)),
      max: CreditService.eurToCredits(CreditService.applyMargin(raw.max)),
    }
  }

  public async getSummary(
    userId: number,
    currentJobId?: string
  ): Promise<{
    photosToProcess: number
    photosWithoutLocation: number
    totalPhotosWithoutLocation: number
    discardedPhotos: number
    estimatedCredits: { min: number; max: number }
    job: LocationInferenceJobState | null
    geolocatability: GeolocatabilityAssessment
  }> {
    const candidatePhotos = await this.getLocationInferenceCandidatePhotos(userId)
    const geolocatability = LocationGeolocatabilityService.assess(candidatePhotos)
    const photosToProcess = geolocatability.plausible.count
    const job = await this.getJob(userId)
    const visibleJob =
      job?.status === 'running' || (currentJobId && job?.jobId === currentJobId) ? job : null

    return {
      photosToProcess,
      photosWithoutLocation: photosToProcess,
      totalPhotosWithoutLocation: geolocatability.total,
      discardedPhotos: geolocatability.discarded.count,
      estimatedCredits: AiLocationInferenceService.estimateCreditsRange(photosToProcess),
      job: visibleJob,
      geolocatability,
    }
  }

  public async start(userId: number, limit?: number): Promise<LocationInferenceJobState> {
    console.log(
      `[AiLocationInference] start() called for userId=${userId}, limit=${limit ?? 'none'}`
    )
    const existingJob = await this.getJob(userId)
    if (existingJob?.status === 'running') {
      throw new Error('A location inference process is already running.')
    }

    let photos = await this.getPhotosWithoutLocation(userId)
    console.log(
      `[AiLocationInference] Found ${photos.length} AI-processable photos without location for userId=${userId}`
    )
    if (photos.length === 0) {
      throw new Error(
        'There are no photos without location metadata that are plausible for AI geolocation.'
      )
    }

    // If the user requested a subset, select the highest-scoring photos first,
    // then re-sort by dateTaken so temporal clustering remains effective.
    if (limit !== undefined && limit > 0 && limit < photos.length) {
      photos = this.selectTopScoredPhotos(photos, limit)
      console.log(
        `[AiLocationInference] Limited to top ${photos.length} photos by geolocatability score`
      )
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
      llmInferred: 0,
      progressPercent: 0,
      progressStage: 'preparing',
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
      failedJob.progressStage = 'failed'
      failedJob.error = errorMessage(error).slice(0, 1000)
      failedJob.completedAt = nowIso()
      failedJob.updatedAt = nowIso()
      failedJob.progressPercent = this.calculateProgressPercent(failedJob)
      await this.setJob(userId, failedJob)
      this.emitProgress(failedJob)
    })

    return job
  }

  public async getJob(userId: number): Promise<LocationInferenceJobState | null> {
    const raw = await redis.get(this.jobKey(userId))
    if (!raw) return null

    try {
      const job = this.normalizeJobState(JSON.parse(raw) as LocationInferenceJobState)
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
          job.progressPercent = this.calculateProgressPercent(job)
          await this.setJob(userId, job)
        }
      }
      return job
    } catch {
      return null
    }
  }

  private async updateProgress(
    userId: number,
    jobId: string,
    stats: LocationInferenceProgressDelta,
    tracker: CostTracker,
    paidGeocodeRequests: number,
    geocodeRequests: number
  ): Promise<void> {
    const currentJob = await this.getJob(userId)
    if (!currentJob || currentJob.jobId !== jobId || currentJob.status !== 'running') return

    if (stats.processedDelta)
      currentJob.processed = clampProgressCount(
        currentJob.processed + stats.processedDelta,
        currentJob.total
      )
    if (stats.locatedDelta)
      currentJob.located = clampProgressCount(
        currentJob.located + stats.locatedDelta,
        currentJob.total
      )
    if (stats.proximitySavedDelta)
      currentJob.proximitySaved = clampProgressCount(
        currentJob.proximitySaved + stats.proximitySavedDelta,
        currentJob.total
      )
    if (stats.unknownDelta)
      currentJob.unknown = clampProgressCount(
        currentJob.unknown + stats.unknownDelta,
        currentJob.total
      )
    if (stats.uncertainDelta)
      currentJob.uncertain = clampProgressCount(
        currentJob.uncertain + stats.uncertainDelta,
        currentJob.total
      )
    if (stats.geocodeMissDelta)
      currentJob.geocodeMiss = clampProgressCount(
        currentJob.geocodeMiss + stats.geocodeMissDelta,
        currentJob.total
      )
    if (stats.failedDelta)
      currentJob.failed = clampProgressCount(
        currentJob.failed + stats.failedDelta,
        currentJob.total
      )
    if (stats.llmInferredDelta)
      currentJob.llmInferred = clampProgressCount(
        (currentJob.llmInferred ?? 0) + stats.llmInferredDelta,
        currentJob.total
      )
    if (stats.progressStage) currentJob.progressStage = stats.progressStage

    currentJob.geocodeRequests = geocodeRequests
    currentJob.costEur =
      tracker.getSummary().totalCostInEur + paidGeocodeRequests * GeocodingService.costEurPerRequest
    currentJob.updatedAt = nowIso()
    currentJob.progressPercent = this.calculateProgressPercent(currentJob)

    console.log(
      `[AiLocationInference] Progress: ${currentJob.processed}/${currentJob.total} | located=${currentJob.located} proximitySaved=${currentJob.proximitySaved} unknown=${currentJob.unknown} uncertain=${currentJob.uncertain} geocodeMiss=${currentJob.geocodeMiss} failed=${currentJob.failed} | costEur=${currentJob.costEur.toFixed(4)}`
    )
    await this.setJob(userId, currentJob)
    this.emitProgress(currentJob)
  }

  private normalizeString(s: string | null | undefined): string {
    if (!s) return ''
    return s
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  private normalizeJobState(job: LocationInferenceJobState): LocationInferenceJobState {
    job.total = Math.max(0, Math.floor(Number(job.total) || 0))
    job.processed = clampProgressCount(job.processed, job.total)
    job.located = clampProgressCount(job.located, job.total)
    job.unknown = clampProgressCount(job.unknown, job.total)
    job.uncertain = clampProgressCount(job.uncertain, job.total)
    job.geocodeMiss = clampProgressCount(job.geocodeMiss, job.total)
    job.failed = clampProgressCount(job.failed, job.total)
    job.proximitySaved = clampProgressCount(job.proximitySaved, job.total)
    job.llmInferred = clampProgressCount(job.llmInferred, job.total)
    job.progressStage = job.progressStage ?? this.inferProgressStage(job)
    job.progressPercent = this.calculateProgressPercent(job)
    return job
  }

  private inferProgressStage(job: LocationInferenceJobState): LocationInferenceProgressStage {
    if (job.status === 'completed') return 'completed'
    if (job.status === 'failed') return 'failed'
    if (job.processed > 0) return 'placing'
    if (job.llmInferred > 0) return 'inferring'
    return 'preparing'
  }

  private calculateProgressPercent(job: LocationInferenceJobState): number {
    if (job.status === 'completed') return 100

    const existing = clampProgressCount(job.progressPercent, job.status === 'running' ? 99 : 100)
    if (job.total <= 0) return existing

    const processed = clampProgressCount(job.processed, job.total)
    const inferredAhead = Math.min(
      Math.max(0, clampProgressCount(job.llmInferred, job.total) - processed),
      Math.max(0, job.total - processed)
    )
    const weightedUnits = processed + inferredAhead * 0.35
    const calculated = Math.round((weightedUnits / job.total) * 100)
    const capped = job.status === 'running' ? Math.min(99, calculated) : calculated

    return Math.max(existing, capped)
  }

  private getIndividualOutcomeStats(
    result: LocationInferenceResult,
    located: boolean,
    failed: boolean
  ) {
    if (located) {
      return { locatedDelta: 1 }
    }
    if (failed) {
      return { failedDelta: 1 }
    }
    if (result.reliability === 'unknown') {
      return { unknownDelta: 1 }
    }
    if (result.reliability === 'uncertain') {
      return { uncertainDelta: 1 }
    }
    return { geocodeMissDelta: 1 }
  }

  private buildTemporalClusters(
    photos: Photo[],
    photoProximityMap: Map<number, PhotoProximityData>
  ): {
    clusters: TemporalCluster[]
    standalone: Photo[]
  } {
    // Separate photos with valid proximity data (only dateTakenMs required, cameraKey not mandatory)
    const validGroup: Photo[] = []
    const standalone: Photo[] = []

    for (const photo of photos) {
      const pd = photoProximityMap.get(photo.id)
      if (typeof pd?.dateTakenMs === 'number') {
        validGroup.push(photo)
      } else {
        standalone.push(photo)
      }
    }

    // Sort all eligible photos by dateTakenMs ascending
    validGroup.sort((a, b) => {
      const aMs = photoProximityMap.get(a.id)!.dateTakenMs!
      const bMs = photoProximityMap.get(b.id)!.dateTakenMs!
      return aMs - bMs
    })

    const clusters: TemporalCluster[] = []
    let currentClusterPhotos: Photo[] = []
    let clusterAnchorMs: number | null = null

    for (const photo of validGroup) {
      const currentMs = photoProximityMap.get(photo.id)!.dateTakenMs!
      if (clusterAnchorMs === null) {
        clusterAnchorMs = currentMs
        currentClusterPhotos = [photo]
      } else if (currentMs - clusterAnchorMs <= PROXIMITY_CLUSTER_CONFIG.proximityWindowMs) {
        currentClusterPhotos.push(photo)
      } else {
        // Finish previous cluster
        if (currentClusterPhotos.length > 0) {
          clusters.push({
            id: crypto.randomUUID(),
            photos: currentClusterPhotos,
            representatives: [],
            followers: [],
          })
        }
        clusterAnchorMs = currentMs
        currentClusterPhotos = [photo]
      }
    }

    if (currentClusterPhotos.length > 0) {
      clusters.push({
        id: crypto.randomUUID(),
        photos: currentClusterPhotos,
        representatives: [],
        followers: [],
      })
    }

    // Dissolve any single-photo clusters into standalone to avoid overhead
    const finalClusters: typeof clusters = []
    for (const cluster of clusters) {
      if (cluster.photos.length <= 1) {
        standalone.push(...cluster.photos)
      } else {
        // Select representatives using Geolocatability score
        const scoredPhotos = cluster.photos.map((p) => ({
          photo: p,
          score: LocationGeolocatabilityService.scorePhoto(
            p.descriptions as Record<string, any> | null | undefined
          ),
        }))
        // Sort descendingly by score (best photos first)
        scoredPhotos.sort((a, b) => b.score - a.score)

        // 1 representative per 5 photos, minimum 1; always keep at least 1 follower.
        const repCount = Math.max(1, Math.floor(cluster.photos.length / 5))
        const actualRepCount = Math.min(cluster.photos.length - 1, repCount)

        const representatives = scoredPhotos.slice(0, actualRepCount).map((sp) => sp.photo)
        const followers = scoredPhotos.slice(actualRepCount).map((sp) => sp.photo)

        cluster.representatives = representatives
        cluster.followers = followers
        finalClusters.push(cluster)
      }
    }

    return { clusters: finalClusters, standalone }
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

    const context = this.createRunContext(userId, jobId)
    const remainingPhotos = await this.phaseDatabaseMatching(context, photoIds, photoProximityMap)
    if (!remainingPhotos) return

    const { clusters, standalone, llmPhotos } = this.phaseBuildClustersAndCandidates(
      remainingPhotos,
      photoProximityMap
    )
    context.clusterCount = clusters.length
    context.standaloneCount = standalone.length
    context.llmPhotoCount = llmPhotos.length
    const llmResultsMap = await this.phaseInferCandidateLocations(context, llmPhotos)
    const fallbackStandalones = await this.phaseProcessClusterConsensus(
      context,
      clusters,
      llmResultsMap
    )

    await this.phaseProcessStandalonePhotos(context, standalone, llmResultsMap)
    await this.phaseProcessFallbackStandalones(context, fallbackStandalones)
    await this.phasePromotionPass(userId, photoIds)
    await this.phaseCompleteJob(context)
  }

  private createRunContext(userId: number, jobId: string): LocationInferenceRunContext {
    const tracker = new CostTracker('location_inference')
    const trackedModels = createTrackedModelsService(this.modelsService, tracker)

    return {
      userId,
      jobId,
      tracker,
      trackedModels,
      geocodingService: new GeocodingService(),
      geocodeRequests: 0,
      paidGeocodeRequests: 0,
      dbPreMatchedCount: 0,
      clusterCount: 0,
      standaloneCount: 0,
      llmPhotoCount: 0,
      progressQueue: pLimit(1),
    }
  }

  private async updateRunProgress(
    context: LocationInferenceRunContext,
    stats: LocationInferenceProgressDelta
  ): Promise<void> {
    await context.progressQueue(() =>
      this.updateProgress(
        context.userId,
        context.jobId,
        stats,
        context.tracker,
        context.paidGeocodeRequests,
        context.geocodeRequests
      )
    )
  }

  private async phaseDatabaseMatching(
    context: LocationInferenceRunContext,
    photoIds: number[],
    photoProximityMap: Map<number, PhotoProximityData>
  ): Promise<Photo[] | null> {
    // Proximity state: photos claimed by a nearby already-geolocated photo.
    const proximityLocated = new Map<number, ProximityClaim>()

    // Pre-match job photos against the user's already-geolocated library in DB.
    // This catches photos taken at the same time with the same camera as a photo
    // that was geolocated in a previous job — no LLM or geocoding needed for them.
    await this.preMatchWithExistingGeolocated(
      context.userId,
      photoIds,
      photoProximityMap,
      proximityLocated
    )

    const photos = await Photo.query().whereIn('id', photoIds).where('user_id', context.userId)
    if (photos.length === 0) return null

    // ── Phase 0: Database matching ──
    const preMatchedPhotos: Photo[] = []
    const remainingPhotos: Photo[] = []

    for (const photo of photos) {
      if (proximityLocated.has(photo.id)) {
        preMatchedPhotos.push(photo)
      } else {
        remainingPhotos.push(photo)
      }
    }

    // Persist pre-matched photos right away
    for (const photo of preMatchedPhotos) {
      const claim = proximityLocated.get(photo.id)!
      console.log(
        `[AiLocationInference] Pre-matched DB shortcut photo ${photo.id} — same camera+time as DB photo ${claim.sourcePhotoId} → ${claim.geocode.formattedAddress}`
      )
      try {
        await this.persistProximityLocation(photo, claim.sourcePhotoId, claim.cacheId)
        await this.updateRunProgress(context, {
          processedDelta: 1,
          locatedDelta: 1,
          proximitySavedDelta: 1,
          progressStage: 'matching',
        })
        context.dbPreMatchedCount++
      } catch (error) {
        console.warn(
          `[AiLocationInference] Could not persist pre-match result for photo ${photo.id}: ${errorMessage(error)}`
        )
        await this.updateRunProgress(context, {
          processedDelta: 1,
          failedDelta: 1,
          progressStage: 'matching',
        })
      }
    }

    return remainingPhotos
  }

  private phaseBuildClustersAndCandidates(
    remainingPhotos: Photo[],
    photoProximityMap: Map<number, PhotoProximityData>
  ): { clusters: TemporalCluster[]; standalone: Photo[]; llmPhotos: Photo[] } {
    // ── Phase 1 & 2: Build Clusters and Choose Representatives ──
    const { clusters, standalone } = this.buildTemporalClusters(remainingPhotos, photoProximityMap)

    console.log(
      `[AiLocationInference] CLUSTERING REPORT: ${remainingPhotos.length} photos grouped into:`
    )
    console.log(
      ` - ${clusters.length} temporal clusters (total ${clusters.reduce((acc, c) => acc + c.photos.length, 0)} photos)`
    )
    console.log(` - ${standalone.length} standalone photos (no camera or temporal matches)`)

    const totalReps = clusters.reduce((acc, c) => acc + c.representatives.length, 0)
    const totalFollowers = clusters.reduce((acc, c) => acc + c.followers.length, 0)
    console.log(
      ` - Selected ${totalReps} representatives and marked ${totalFollowers} followers/listeners.`
    )
    console.log(` - Saved upfront ${totalFollowers} photos from LLM processing!`)

    // Identify all photos that need LLM inference (LLM Candidates)
    const llmPhotos = [...standalone, ...clusters.flatMap((c) => c.representatives)]

    return { clusters, standalone, llmPhotos }
  }

  private async phaseInferCandidateLocations(
    context: LocationInferenceRunContext,
    llmPhotos: Photo[]
  ): Promise<Map<number, LocationInferenceResult>> {
    const llmResultsMap = new Map<number, LocationInferenceResult>()

    // ── Phase 3: LLM Inference for Standalones + Representatives ──
    if (llmPhotos.length === 0) return llmResultsMap

    console.log(`[AiLocationInference] Batching ${llmPhotos.length} LLM candidate photos...`)
    const batches = this.chunk(llmPhotos, AI_LOCATION_INFERENCE_CONFIG.batchSize)
    const batchLimit = pLimit(AI_LOCATION_INFERENCE_CONFIG.batchConcurrency)
    context.tracker.setCurrentTask('infer_location')

    await Promise.all(
      batches.map((batchOfPhotos) =>
        batchLimit(async () => {
          console.log(
            `[AiLocationInference] Processing LLM batch of ${batchOfPhotos.length} photos: [${batchOfPhotos.map((p) => p.id).join(', ')}]`
          )
          let results: LocationInferenceResult[]
          try {
            results = await this.inferBatchLocations(batchOfPhotos, context.trackedModels)
          } catch (error) {
            console.warn(`[AiLocationInference] LLM batch failed: ${errorMessage(error)}`)
            results = this.createUnknownInferenceResults(
              batchOfPhotos,
              `LLM batch selection failed: ${errorMessage(error).slice(0, 240)}`
            )
          }

          for (const result of results) {
            llmResultsMap.set(result.id, result)
          }

          // Advance the llmInferred counter so the frontend can show real progress
          // during the LLM phase (before geocoding starts and processed begins moving).
          await this.updateRunProgress(context, {
            llmInferredDelta: batchOfPhotos.length,
            progressStage: 'inferring',
          })
        })
      )
    )

    return llmResultsMap
  }

  private async phaseProcessClusterConsensus(
    context: LocationInferenceRunContext,
    clusters: TemporalCluster[],
    llmResultsMap: Map<number, LocationInferenceResult>
  ): Promise<Photo[]> {
    const fallbackStandalones: Photo[] = []

    // ── Phase 4: Cluster Consensus & Propagation ──
    for (const cluster of clusters) {
      console.log(`[AiLocationInference] Evaluating CLUSTER total=${cluster.photos.length} photos`)

      // Gather LLM results for representatives of this cluster
      const repsWithResults = this.getClusterRepresentativeResults(cluster, llmResultsMap)
      const chosenAnchor = this.selectClusterConsensusAnchor(cluster, repsWithResults)

      // If consensus is reached, geocode only the anchor
      const geocodeSuccessful = chosenAnchor
        ? await this.tryPersistClusterConsensus(context, cluster, chosenAnchor)
        : false

      // If consensus failed OR geocoding failed, dissolve the cluster
      if (!geocodeSuccessful) {
        console.log(
          `[AiLocationInference] Dissolving cluster: representatives will be geocoded individually; ${cluster.followers.length} followers rescheduled search.`
        )

        // Representatives already have LLM results, we process them individually
        await this.processClusterRepresentativesIndividually(context, repsWithResults)

        // Followers are pushed to fallbackStandalones
        for (const follower of cluster.followers) {
          fallbackStandalones.push(follower)
        }
      }
    }

    return fallbackStandalones
  }

  private getClusterRepresentativeResults(
    cluster: TemporalCluster,
    llmResultsMap: Map<number, LocationInferenceResult>
  ): { photo: Photo; result: LocationInferenceResult }[] {
    const repsWithResults: { photo: Photo; result: LocationInferenceResult }[] = []
    for (const photo of cluster.representatives) {
      const result = llmResultsMap.get(photo.id)
      if (result) {
        repsWithResults.push({ photo, result })
      }
    }
    return repsWithResults
  }

  private selectClusterConsensusAnchor(
    cluster: TemporalCluster,
    repsWithResults: { photo: Photo; result: LocationInferenceResult }[]
  ): { photo: Photo; result: LocationInferenceResult } | null {
    // Filter A: discard granularities > city (and those with too low reliability)
    const aptReps = repsWithResults.filter((item) => {
      const r = item.result
      const isAptGranularity = r.geocodeGranularity === 'place' || r.geocodeGranularity === 'city'
      const isReliable = r.reliability === 'very_likely'
      return isReliable && isAptGranularity
    })

    // Filter B: Check 75% threshold
    const originalCount = cluster.representatives.length
    const aptRatio = aptReps.length / originalCount

    if (aptRatio < PROXIMITY_CLUSTER_CONFIG.requiredAgreementPercentage || aptReps.length === 0) {
      console.log(
        `[AiLocationInference] CLUSTER consensus Failed: only ${aptReps.length}/${originalCount} (${Math.round(aptRatio * 100)}%) representatives are apt (minimum 75% required).`
      )
      return null
    }

    // Filter C: Compare apt representatives for agreement on Country + City
    const first = aptReps[0].result
    const firstCountryNormalized = this.normalizeString(first.inferredCountry)
    const firstCityNormalized = this.normalizeString(first.inferredCity)

    if (aptReps.length > 1) {
      console.log(
        `[AiLocationInference] More than one apt representative: ${aptReps.length}/${originalCount} (${Math.round(aptRatio * 100)}%) — checking agreement on country + city.`
      )
    }

    const allAgree = aptReps.every((item) => {
      const r = item.result
      return (
        this.normalizeString(r.inferredCountry) === firstCountryNormalized &&
        this.normalizeString(r.inferredCity) === firstCityNormalized
      )
    })

    if (!allAgree) {
      console.log(
        `[AiLocationInference] CLUSTER consensus Failed: representatives do not agree on country + city.`
      )
      return null
    }

    console.log(
      `[AiLocationInference] CLUSTER consensus OK! ${aptReps.length}/${originalCount} representatives (>=75%) agree on "${first.inferredCity || 'No City'}, ${first.inferredCountry}"`
    )

    // Filter D: select highest granularity ('place' over 'city')
    const sortedAptReps = [...aptReps].sort((a, b) => {
      const aGran = a.result.geocodeGranularity === 'place' ? 2 : 1
      const bGran = b.result.geocodeGranularity === 'place' ? 2 : 1
      if (aGran !== bGran) return bGran - aGran // places first

      // Tie breaker: geolocatability score
      const aScore = LocationGeolocatabilityService.scorePhoto(
        a.photo.descriptions as Record<string, any> | null | undefined
      )
      const bScore = LocationGeolocatabilityService.scorePhoto(
        b.photo.descriptions as Record<string, any> | null | undefined
      )
      return bScore - aScore
    })

    return sortedAptReps[0] ?? null
  }

  private async tryPersistClusterConsensus(
    context: LocationInferenceRunContext,
    cluster: TemporalCluster,
    chosenAnchor: { photo: Photo; result: LocationInferenceResult }
  ): Promise<boolean> {
    const result = chosenAnchor.result
    const photo = chosenAnchor.photo

    if (!this.shouldGeocode(result)) return false

    context.geocodeRequests++
    console.log(
      `[AiLocationInference] Geocoding cluster anchor photo ${photo.id} — query="${result.geocodeQuery}"`
    )

    try {
      const lookup = await context.geocodingService.geocode(result.geocodeQuery!, {
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
      context.paidGeocodeRequests += lookup.externalCalls

      if (!lookup.result) {
        console.log(
          `[AiLocationInference] Geocode returned no results for cluster anchor photo ${photo.id}`
        )
        return false
      }

      console.log(
        `[AiLocationInference] Geocode success for cluster anchor photo ${photo.id} — ${lookup.result.formattedAddress}`
      )

      // Guard/persist the anchor photo with the complete found address
      await this.persistLocation(photo, result, lookup.cacheId ?? null)
      await this.updateRunProgress(context, {
        processedDelta: 1,
        locatedDelta: 1,
        progressStage: 'placing',
      })

      // Propagate to other representatives and followers
      const othersInCluster = cluster.photos.filter((p) => p.id !== photo.id)
      console.log(
        `[AiLocationInference] Propagating location from photo ${photo.id} to ${othersInCluster.length} cluster companions (saved LLM/geocoding!)`
      )

      for (const companion of othersInCluster) {
        try {
          await this.persistProximityLocation(companion, photo.id, lookup.cacheId ?? null)
          await this.updateRunProgress(context, {
            processedDelta: 1,
            locatedDelta: 1,
            proximitySavedDelta: 1,
            progressStage: 'placing',
          })
        } catch (err) {
          console.warn(
            `[AiLocationInference] Could not propagate location to companion photo ${companion.id}: ${errorMessage(err)}`
          )
          await this.updateRunProgress(context, {
            processedDelta: 1,
            failedDelta: 1,
            progressStage: 'placing',
          })
        }
      }

      return true
    } catch (error) {
      console.warn(
        `[AiLocationInference] Geocoding failed for cluster anchor photo ${photo.id}: ${errorMessage(error)}`
      )
      return false
    }
  }

  private async processClusterRepresentativesIndividually(
    context: LocationInferenceRunContext,
    repsWithResults: { photo: Photo; result: LocationInferenceResult }[]
  ): Promise<void> {
    for (const item of repsWithResults) {
      await this.processIndividualInference(context, item.photo, item.result, 'representative')
    }
  }

  private async phaseProcessStandalonePhotos(
    context: LocationInferenceRunContext,
    standalone: Photo[],
    llmResultsMap: Map<number, LocationInferenceResult>
  ): Promise<void> {
    // ── Phase 5: Process Standalone Photos ──
    for (const photo of standalone) {
      const result = llmResultsMap.get(photo.id)
      if (!result) continue

      await this.processIndividualInference(context, photo, result, 'standalone')
    }
  }

  private async phaseProcessFallbackStandalones(
    context: LocationInferenceRunContext,
    fallbackStandalones: Photo[]
  ): Promise<void> {
    // ── Phase 6: Process Fallback Standalones (Followers from failed/dissolved clusters) ──
    if (fallbackStandalones.length > 0) {
      console.log(
        `[AiLocationInference] Processing ${fallbackStandalones.length} followers as fallback individual standalones...`
      )
      const fallbackBatches = this.chunk(
        fallbackStandalones,
        AI_LOCATION_INFERENCE_CONFIG.batchSize
      )

      for (const fallbackBatch of fallbackBatches) {
        let results: LocationInferenceResult[]
        try {
          results = await this.inferBatchLocations(fallbackBatch, context.trackedModels)
        } catch (error) {
          console.warn(`[AiLocationInference] Fallback LLM batch failed: ${errorMessage(error)}`)
          results = this.createUnknownInferenceResults(
            fallbackBatch,
            `Fallback inference failed: ${errorMessage(error).slice(0, 240)}`
          )
        }

        // Advance the llmInferred counter for fallback batches too.
        await this.updateRunProgress(context, {
          llmInferredDelta: fallbackBatch.length,
          progressStage: 'inferring',
        })

        for (const result of results) {
          const photo = fallbackBatch.find((candidate) => candidate.id === result.id)
          if (!photo) continue

          await this.processIndividualInference(context, photo, result, 'fallback')
        }
      }
    }
  }

  private async processIndividualInference(
    context: LocationInferenceRunContext,
    photo: Photo,
    result: LocationInferenceResult,
    kind: 'representative' | 'standalone' | 'fallback'
  ): Promise<void> {
    let located = false
    let failed = false

    try {
      if (this.shouldGeocode(result)) {
        context.geocodeRequests++
        this.logIndividualGeocode(photo, result, kind)
        const lookup = await context.geocodingService.geocode(result.geocodeQuery!, {
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
        context.paidGeocodeRequests += lookup.externalCalls

        if (lookup.result) {
          await this.persistLocation(photo, result, lookup.cacheId ?? null)
          located = true
        } else {
          await this.persistInferenceOnly(photo, result)
        }
      } else {
        await this.persistInferenceOnly(photo, result)
      }
    } catch (error) {
      failed = true
      this.logIndividualFailure(photo, error, kind)
    }

    await this.updateRunProgress(context, {
      processedDelta: 1,
      ...this.getIndividualOutcomeStats(result, located, failed),
      progressStage: 'placing',
    })
  }

  private logIndividualGeocode(
    photo: Photo,
    result: LocationInferenceResult,
    kind: 'representative' | 'standalone' | 'fallback'
  ): void {
    if (kind === 'representative') {
      console.log(
        `[AiLocationInference] Geocoding representative ${photo.id} individually — query="${result.geocodeQuery}"`
      )
      return
    }

    console.log(
      `[AiLocationInference] Geocoding ${kind} photo ${photo.id} — query="${result.geocodeQuery}"`
    )
  }

  private logIndividualFailure(
    photo: Photo,
    error: unknown,
    kind: 'representative' | 'standalone' | 'fallback'
  ): void {
    if (kind === 'representative') {
      console.warn(
        `[AiLocationInference] Individual fail for representative photo ${photo.id}: ${errorMessage(error)}`
      )
      return
    }

    const label = kind === 'standalone' ? 'Standalone' : 'Fallback'
    console.warn(`[AiLocationInference] ${label} photo ${photo.id} failed: ${errorMessage(error)}`)
  }

  private createUnknownInferenceResults(
    photos: Photo[],
    reasoning: string
  ): LocationInferenceResult[] {
    return photos.map((photo) => ({
      id: photo.id,
      reliability: 'unknown',
      geocodeQuery: null,
      geocodeGranularity: null,
      inferredPlace: null,
      inferredCity: null,
      inferredRegion: null,
      inferredCountry: null,
      reasoning,
    }))
  }

  private async phasePromotionPass(userId: number, photoIds: number[]): Promise<void> {
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
  }

  private async phaseCompleteJob(context: LocationInferenceRunContext): Promise<void> {
    const completedJob = await this.getJob(context.userId)
    if (!completedJob || completedJob.jobId !== context.jobId) return

    const costSummary = context.tracker.getSummary()
    const llmCostEur = costSummary.totalCostInEur
    const geocodingCostEur = context.paidGeocodeRequests * GeocodingService.costEurPerRequest
    const totalCostEur = llmCostEur + geocodingCostEur

    const clusterProximitySaved = completedJob.proximitySaved - context.dbPreMatchedCount
    const totalProximitySaved = completedJob.proximitySaved
    const locatedPct =
      completedJob.total > 0
        ? ((completedJob.located / completedJob.total) * 100).toFixed(1)
        : '0.0'
    const savedLlmCostEur = (totalProximitySaved * ESTIMATE_LLM_EUR_PER_PHOTO).toFixed(4)
    const savedGeocodeCostEur = (
      totalProximitySaved *
      0.65 *
      GeocodingService.costEurPerRequest
    ).toFixed(4)

    completedJob.costEur = totalCostEur
    completedJob.geocodeRequests = context.geocodeRequests

    // Charge the real LLM + geocoding cost with the standard commercial margin.
    if (completedJob.costEur > 0) {
      try {
        completedJob.creditsCharged = await CreditService.charge(
          context.userId,
          completedJob.costEur
        )
      } catch {}
    }

    try {
      await CacheInvalidationService.onPhotosGeolocationUpdate(String(context.userId))
    } catch (error) {
      console.warn(`[AiLocationInference] Cache invalidation failed: ${errorMessage(error)}`)
    }

    completedJob.status = 'completed'
    completedJob.progressStage = 'completed'
    completedJob.progressPercent = 100
    completedJob.completedAt = nowIso()
    completedJob.updatedAt = nowIso()
    await this.setJob(context.userId, completedJob)
    this.emitProgress(completedJob)

    UserCostService.recordFromTracker(context.userId, context.tracker, context.jobId).catch(
      () => {}
    )
    if (context.paidGeocodeRequests > 0) {
      UserCostService.record(
        context.userId,
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

    console.log(
      `[AiLocationInference] ══════════════════════════ JOB SUMMARY ══════════════════════════`
    )
    console.log(`[AiLocationInference] Job ${context.jobId} — COMPLETED`)
    console.log(
      `[AiLocationInference]   Photos      : total=${completedJob.total} | located=${completedJob.located} (${locatedPct}%) | unknown=${completedJob.unknown} | uncertain=${completedJob.uncertain} | geocodeMiss=${completedJob.geocodeMiss} | failed=${completedJob.failed}`
    )
    console.log(
      `[AiLocationInference]   Clustering  : ${context.clusterCount} clusters | ${context.standaloneCount} standalone | ${context.llmPhotoCount} photos sent to LLM`
    )
    console.log(
      `[AiLocationInference]   Geocoding   : ${context.geocodeRequests} requests total (${context.paidGeocodeRequests} paid / ${context.geocodeRequests - context.paidGeocodeRequests} cached)`
    )
    console.log(
      `[AiLocationInference]   Cost        : €${totalCostEur.toFixed(4)} total | LLM €${llmCostEur.toFixed(4)} | geocoding €${geocodingCostEur.toFixed(4)}`
    )
    console.log(
      `[AiLocationInference]   Proximity   : ${totalProximitySaved} photos saved for LLM+geocoding → ${context.dbPreMatchedCount} DB pre-match + ${clusterProximitySaved} cluster propagation`
    )
    console.log(
      `[AiLocationInference]   Est. savings: ~€${savedLlmCostEur} LLM + ~€${savedGeocodeCostEur} geocoding avoided thanks to proximity`
    )
    console.log(`[AiLocationInference]   Credits charged: ${completedJob.creditsCharged} credits`)
    console.log(
      `[AiLocationInference] ═══════════════════════════════════════════════════════════════════`
    )

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
                true,
                { thinkingLevel: AI_LOCATION_INFERENCE_CONFIG.thinkingLevel }
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
    cacheId: number | null
  ): Promise<void> {
    // Store only the fields that don't live in geocode_cache (granularity, address, placeId are there)
    await this.photoManager.updatePhotoDescriptions(String(photo.id), {
      EXIF: {
        aiLocationInference: {
          reliability: inference.reliability,
          inferredAt: nowIso(),
        },
      },
    })
    // Point the photo to the geocode_cache row
    if (cacheId != null) {
      await db.from('photos').where('id', photo.id).update({ inferred_location_id: cacheId })
    }
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
          inferredAt: nowIso(),
        },
      },
    })
  }

  public async getPhotosWithoutLocation(userId: number): Promise<Photo[]> {
    const photos = await this.getLocationInferenceCandidatePhotos(userId)
    // This is the pipeline boundary: discarded photos never reach credits,
    // proximity matching, clustering, representative scoring, LLM, or geocoding.
    return LocationGeolocatabilityService.classify(photos).plausible
  }

  private async getLocationInferenceCandidatePhotos(userId: number): Promise<Photo[]> {
    const query = Photo.query()
      .where('user_id', userId)
      .orderByRaw("(descriptions->'EXIF'->>'dateTaken') ASC NULLS LAST")
      .preload('analyzerProcess')
      .select([
        'id',
        'user_id',
        'name',
        'thumbnail_name',
        'original_file_name',
        'descriptions',
        'analyzer_process_id',
        'inferred_location_id',
      ])

    const photos = await query

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
    // NEW: AI-inferred location stored via FK (post-migration)
    if (photo.inferredLocationId != null) return true

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
   * (same camera key + dateTaken within PROXIMITY_CLUSTER_CONFIG.proximityWindowMs).
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
      .select(['id', 'descriptions', 'inferred_location_id'])
      .preload('inferredLocation')

    // Build a time-sorted array of geolocated library entries.
    const sortedGeolocated: Array<{
      id: number
      dateTakenMs: number
      geocode: GeocodedLocation
      geocodeGranularity: LocationGranularity | null
      cacheId: number | null
    }> = []

    for (const photo of existingPhotos) {
      if (excludeSet.has(photo.id)) continue

      const exif = (photo.descriptions as any)?.EXIF
      let lat: number
      let lng: number
      let formattedAddress: string
      let placeId: string | null
      let cacheId: number | null = null

      if (photo.inferredLocation) {
        // New AI-inferred photo (post-migration): coordinates and address live in geocode_cache
        lat = Number(photo.inferredLocation.lat)
        lng = Number(photo.inferredLocation.lng)
        cacheId = photo.inferredLocation.id
        formattedAddress = photo.inferredLocation.formattedAddress ?? ''
        placeId = photo.inferredLocation.placeId ?? null
        if (!exif) continue
        // Don't use proximity-located photos as anchors
        if (exif.aiLocationInference?.proximityLocated === true) continue
      } else {
        // Real GPS or legacy AI-inferred (pre-migration): coordinates in EXIF
        if (!exif) continue
        lat = Number(exif.gpsLatitude)
        lng = Number(exif.gpsLongitude)
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        )
          continue
        if (exif.aiLocationInference?.proximityLocated === true) continue
        formattedAddress = exif.aiLocationInference?.formattedAddress ?? ''
        placeId = exif.aiLocationInference?.placeId ?? null
      }

      const pd = this.extractProximityData(photo)
      if (!pd.dateTakenMs) continue

      const geocode: GeocodedLocation = { lat, lng, formattedAddress, placeId }
      // Granularity: FK row is the source of truth; fall back to legacy EXIF for pre-migration photos
      const granularityRaw =
        photo.inferredLocation?.granularity ?? exif?.aiLocationInference?.geocodeGranularity
      const geocodeGranularity: LocationGranularity | null = LOCATION_GRANULARITIES.includes(
        granularityRaw
      )
        ? granularityRaw
        : null

      sortedGeolocated.push({
        id: photo.id,
        dateTakenMs: pd.dateTakenMs,
        geocode,
        geocodeGranularity,
        cacheId,
      })
    }

    if (sortedGeolocated.length === 0) return

    sortedGeolocated.sort((a, b) => a.dateTakenMs - b.dateTakenMs)

    // Match each job photo against the time-sorted library.
    for (const [photoId, pd] of photoProximityMap) {
      if (!pd.dateTakenMs) continue
      if (proximityLocated.has(photoId)) continue

      for (const candidate of sortedGeolocated) {
        if (
          Math.abs(candidate.dateTakenMs - pd.dateTakenMs) <=
          PROXIMITY_CLUSTER_CONFIG.proximityWindowMs
        ) {
          proximityLocated.set(photoId, {
            geocode: candidate.geocode,
            sourcePhotoId: candidate.id,
            geocodeGranularity: candidate.geocodeGranularity,
            cacheId: candidate.cacheId,
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
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

    // Native EXIF: "YYYY:MM:DD HH:MM:SS" (colons as date separators)
    const exifColon = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (exifColon) {
      const ts = Date.parse(
        `${exifColon[1]}-${exifColon[2]}-${exifColon[3]}T${exifColon[4]}:${exifColon[5]}:${exifColon[6]}Z`
      )
      return Number.isNaN(ts) ? null : ts
    }

    // Client-normalised: "YYYY-MM-DD HH:MM:SS" (space separator, no timezone)
    const isoSpace = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/)
    if (isoSpace) {
      const ts = Date.parse(`${isoSpace[1]}T${isoSpace[2]}Z`)
      return Number.isNaN(ts) ? null : ts
    }

    const ts = Date.parse(raw)
    return Number.isNaN(ts) ? null : ts
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
   * Persist GPS coordinates on a photo that was located by proximity (no LLM, no geocoding).
   * Sets aiLocationInference.proximityLocated=true and records the source photo ID.
   */
  private async persistProximityLocation(
    photo: Photo,
    sourcePhotoId: number,
    cacheId: number | null
  ): Promise<void> {
    // Store only the fields that don't live in geocode_cache
    await this.photoManager.updatePhotoDescriptions(String(photo.id), {
      EXIF: {
        aiLocationInference: {
          reliability: 'very_likely',
          inferredAt: nowIso(),
          proximityLocated: true,
          proximitySourcePhotoId: sourcePhotoId,
        },
      },
    })
    // Point the photo to the same geocode_cache row as the anchor
    if (cacheId != null) {
      await db.from('photos').where('id', photo.id).update({ inferred_location_id: cacheId })
    }
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
      .select(['id', 'descriptions', 'inferred_location_id'])

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
      currentInference: Record<string, any>
    }

    const entries: GeoEntry[] = []
    for (const photo of photos) {
      const exif = (photo.descriptions as any)?.EXIF
      if (!exif) continue

      // Only consider photos that were actually geocoded in this job (FK set or legacy EXIF GPS).
      const hasLocation =
        photo.inferredLocationId != null ||
        (() => {
          const lat = Number(exif.gpsLatitude)
          const lng = Number(exif.gpsLongitude)
          return (
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          )
        })()
      if (!hasLocation) continue

      const inference = exif.aiLocationInference
      if (!inference) continue

      const reliability = this.normalizeReliability(inference.reliability)
      if (reliability === 'unknown') continue

      const pd = this.extractProximityData(photo)
      if (!pd.dateTakenMs) continue

      entries.push({
        id: photo.id,
        reliability,
        dateTakenMs: pd.dateTakenMs,
        currentInference: inference,
      })
    }

    let promoted = 0
    for (const entry of entries) {
      if (entry.reliability === 'very_likely') continue

      // Nearest neighbour with strictly higher reliability within the time window.
      // Only directly-inferred photos (not proximity-located ones) can act as anchors,
      // preventing indirect reliability boosts through a proximity chain.
      const anchor = entries.find(
        (p) =>
          p.id !== entry.id &&
          !p.currentInference.proximityLocated &&
          RANK[p.reliability] > RANK[entry.reliability] &&
          Math.abs(p.dateTakenMs - entry.dateTakenMs) <= PROXIMITY_CLUSTER_CONFIG.proximityWindowMs
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

    return promoted
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
  }

  /**
   * Select the top `limit` photos by geolocatability score (highest first),
   * then re-sort the selected subset by dateTaken ASC so that temporal
   * proximity clustering remains effective on the chosen photos.
   */
  private selectTopScoredPhotos(photos: Photo[], limit: number): Photo[] {
    const scored = photos.map((photo) => ({
      photo,
      score: LocationGeolocatabilityService.scorePhoto(photo.descriptions as any),
    }))

    // Descending by score — ties broken by original order (stable sort).
    scored.sort((a, b) => b.score - a.score)

    const selected = scored.slice(0, limit).map((s) => s.photo)

    // Re-sort by dateTaken ASC so temporal clustering works on this subset.
    selected.sort((a, b) => {
      const da = this.parseDateTakenMs((a.descriptions as any)?.EXIF?.dateTaken)
      const db = this.parseDateTakenMs((b.descriptions as any)?.EXIF?.dateTaken)
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    })

    return selected
  }
}
