import { DateTime } from 'luxon'
import sharp from 'sharp'
import pLimit from 'p-limit'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import PortfolioBuild from '#models/portfolio_build'
import type {
  PortfolioBuildConfig,
  PortfolioBuildResult,
  CoherenceMode,
} from '#models/portfolio_build'
import Photo from '#models/photo'
import User from '#models/user'
import PhotoManager from '../managers/photo_manager.js'
import PhotoImageService from './photo_image_service.js'
import ModelsService, { PRICES, USD_TO_EUR } from './models_service.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import UserCostService from './user_cost_service.js'
import CreditService from './credit_service.js'
import MailService from './mail_service.js'
import { portfolioBuildCompleteTemplate } from '../utils/email_templates.js'
import Ws from '#services/ws'
import db from '@adonisjs/lucid/services/db'
import CpuWorkerPool from './cpu_worker_pool.js'
import { DHASH_DUPLICATE_THRESHOLD } from '../utils/dhash.js'

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

/** Recall pool = targetSize × multiplier (before RECALL_MAX cap). */
const RECALL_MULTIPLIER = 5
/** Hard cap on the recall pool regardless of catalog size. */
const RECALL_MAX = 800
/** Photos sent to the LLM per evaluation batch. */
const BATCH_SIZE = 6
/** Process batches from highest to lowest composite score. */
const BATCH_ORDER: 'desc' | 'asc' = 'desc'
/** Stop evaluation once targetSize is reached (only meaningful when BATCH_ORDER = 'desc'). */
const EARLY_STOP = true
/** LLM model for the heavy evaluation batches (must support vision). */
const EVALUATION_MODEL = 'gpt-5.1'
/** LLM model for the refinement pass (must support vision). */
const REFINEMENT_MODEL = 'gpt-5.1'
/** Cheap model used to parse freetext into structured filters. */
const PARSE_MODEL = 'gpt-5-nano'
/** Generate a grid image of the current selection for the refinement LLM. */
const REFINEMENT_USE_GRID_IMAGE = true
/** Whether the sequencing option is available at all. */
const ENABLE_SEQUENCING = true
/** Allowed target-size range. */
const MAX_TARGET_SIZE = 60
const MIN_TARGET_SIZE = 10
/** Minimum ratio of analyzed photos (with artistic_scores) required to start a build. */
const MIN_ANALYZED_RATIO = 0.8
/** Grid thumbnail cell size in pixels. */
const GRID_CELL_SIZE = 280
/** Save debug artifacts (e.g. grid image) to disk. */
const DEBUG_SAVE_GRID = true

// ── Score field mapping (mirrors agent_tools_service) ────────
const SCORE_FIELD_MAP: Record<string, string> = { originality: 'strangeness' }
function internalScoreField(field: string): string {
  return SCORE_FIELD_MAP[field] ?? field
}

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type PhotoPreview = {
  id: number
  originalFileName: string
  thumbnailUrl: string
  descriptions: {
    visual_aspects: Record<string, any>
    artistic_scores: Record<string, number> | null
    EXIF: Record<string, any>
    source: Record<string, any>
  }
}

type ScoredCandidate = PhotoPreview & {
  compositeScore: number
  coherenceScore?: number
}

type BatchDecision = {
  id: number
  select: boolean
  reason: string
}

// ══════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════

export default class PortfolioBuildService {
  private photoManager = new PhotoManager()
  private modelsService = new ModelsService()

  // ── Public API ──────────────────────────────────────────────

  /**
   * Start a portfolio build. Returns immediately; the heavy work runs
   * in the background. The caller should respond 202 to the client.
   */
  public async startBuild(userId: number, config: PortfolioBuildConfig): Promise<PortfolioBuild> {
    // Validate no concurrent build
    const running = await PortfolioBuild.query()
      .where('user_id', userId)
      .whereIn('status', ['pending', 'parsing', 'recall', 'evaluating', 'refining', 'sequencing'])
      .first()
    if (running) {
      throw new Error('A portfolio build is already in progress.')
    }

    const build = await PortfolioBuild.create({
      userId,
      status: 'pending',
      config,
      progress: 0,
      costEur: 0,
    })

    // Fire-and-forget
    this.runBuild(build.id).catch((err) => {
      console.error(`[PortfolioBuild] ❌ Fatal error in build ${build.id}:`, err)
    })

    return build
  }

  /**
   * Get current status of a build.
   */
  public async getStatus(buildId: number, userId: number): Promise<PortfolioBuild | null> {
    return PortfolioBuild.query().where('id', buildId).where('user_id', userId).first()
  }

  /**
   * List builds for a user (most recent first).
   */
  public async listBuilds(userId: number): Promise<PortfolioBuild[]> {
    return PortfolioBuild.query().where('user_id', userId).orderBy('created_at', 'desc').limit(20)
  }

  /**
   * Abort an in-progress build.
   */
  public async abort(buildId: number, userId: number): Promise<boolean> {
    const build = await PortfolioBuild.query()
      .where('id', buildId)
      .where('user_id', userId)
      .whereNotIn('status', ['completed', 'failed'])
      .first()
    if (!build) return false
    build.status = 'failed'
    build.error = 'Aborted by user'
    build.completedAt = DateTime.now()
    await build.save()
    return true
  }

  // ── Main pipeline ──────────────────────────────────────────

  private async runBuild(buildId: number): Promise<void> {
    const build = await PortfolioBuild.findOrFail(buildId)
    const config = build.config
    const tracker = new CostTracker('other')

    try {
      build.startedAt = DateTime.now()
      build.status = 'parsing'
      await build.save()
      this.emitProgress(build)

      // ── Step 1: Parse freetext ──
      tracker.setCurrentTask('parse_freetext')
      const parsedFilters = config.freetext
        ? await this.parseUserFreetext(config.freetext, tracker)
        : null
      build.parsedFilters = parsedFilters
      await build.save()

      // ── Step 2: Recall ──
      await this.updateStatus(build, 'recall', 5)
      const candidates = await this.recall(build.userId, config, parsedFilters)
      if (candidates.length === 0) {
        throw new Error('No eligible photos found after recall. Ensure your catalog is analyzed.')
      }

      // ── Step 3: Compute coherence scores ──
      if (config.coherenceMode !== 'free') {
        await this.computeCoherenceScores(candidates, config.coherenceMode, build.userId)
      }

      // ── Step 4: Evaluate batches ──
      await this.updateStatus(build, 'evaluating', 10)
      const trackedModels = createTrackedModelsService(this.modelsService, tracker)
      const selected = await this.evaluateBatches(build, candidates, config, trackedModels, tracker)

      // ── Step 5: Refinement ──
      let refinementNotes: string | undefined
      if (selected.length > 0) {
        await this.updateStatus(build, 'refining', 85)
        tracker.setCurrentTask('refinement')
        refinementNotes = await this.refinementPass(selected, config, trackedModels, build.id)
      }

      // ── Step 6: Sequencing (optional) ──
      let sequencingNotes: string | undefined
      let finalIds = selected.map((p) => p.id)
      if (ENABLE_SEQUENCING && config.sequencing && selected.length > 1) {
        await this.updateStatus(build, 'sequencing', 92)
        tracker.setCurrentTask('sequencing')
        const seqResult = await this.sequencingPass(selected, config, trackedModels)
        finalIds = seqResult.orderedIds
        sequencingNotes = seqResult.notes
      }

      // ── Step 7: Generate final portfolio grid image ──
      let gridImagePath: string | undefined
      if (selected.length > 0) {
        try {
          // Order selected photos by finalIds for the grid
          const orderedSelected = finalIds
            .map((id) => selected.find((p) => p.id === id))
            .filter(Boolean) as ScoredCandidate[]

          const gridBuffer = await this.generateGridImage(orderedSelected)
          if (gridBuffer) {
            const gridDir = path.join(process.cwd(), 'tmp', 'debug')
            await mkdir(gridDir, { recursive: true })
            gridImagePath = path.join(gridDir, `portfolio_final_${build.id}_${Date.now()}.jpg`)
            await writeFile(gridImagePath, gridBuffer)
            console.log(
              `[PortfolioBuild] 🖼️ Final portfolio grid saved: ${gridImagePath} (${Math.round(gridBuffer.length / 1024)}KB)`
            )
          }
        } catch (err) {
          console.warn(`[PortfolioBuild] ⚠️ Final grid generation failed:`, (err as Error).message)
        }
      }

      // ── Finalize ──
      const costSummary = tracker.getSummary()
      build.status = 'completed'
      build.progress = 100
      build.completedAt = DateTime.now()
      build.costEur = costSummary.totalCostInEur
      build.result = {
        photoIds: finalIds,
        photoItems: finalIds.map((id) => {
          const photo = selected.find((p) => p.id === id)
          return { id, thumbnailUrl: photo?.thumbnailUrl ?? '' }
        }),
        recallSize: candidates.length,
        batchesEvaluated: Math.ceil(candidates.length / BATCH_SIZE),
        totalCandidatesEvaluated: candidates.length,
        refinementNotes,
        sequencingNotes,
        gridImagePath,
      }
      await build.save()
      this.emitProgress(build)

      // Record cost & charge credits
      UserCostService.record(
        build.userId,
        'other',
        costSummary.totalCostInEur,
        costSummary.totalCalls,
        { task: 'portfolio_build', referenceId: String(build.id) }
      ).catch(() => {})

      if (costSummary.totalCostInEur > 0) {
        CreditService.charge(build.userId, costSummary.totalCostInEur).catch(() => {})
      }

      // Notify user
      await this.notifyCompletion(build)

      console.log(
        `[PortfolioBuild] ✅ Build ${build.id} completed | ` +
          `${finalIds.length} photos selected from ${candidates.length} candidates | ` +
          `Cost: €${costSummary.totalCostInEur.toFixed(4)}`
      )
    } catch (err: any) {
      build.status = 'failed'
      build.error = err.message?.slice(0, 2000) ?? 'Unknown error'
      build.completedAt = DateTime.now()
      const costSummary = tracker.getSummary()
      build.costEur = costSummary.totalCostInEur
      await build.save()
      this.emitProgress(build)

      UserCostService.record(
        build.userId,
        'other',
        costSummary.totalCostInEur,
        costSummary.totalCalls,
        { task: 'portfolio_build', referenceId: String(build.id), metadata: { error: true } }
      ).catch(() => {})

      if (costSummary.totalCostInEur > 0) {
        CreditService.charge(build.userId, costSummary.totalCostInEur).catch(() => {})
      }

      console.error(`[PortfolioBuild] ❌ Build ${build.id} failed:`, err.message)
    }
  }

  // ── Step 1: Parse freetext ─────────────────────────────────

  private async parseUserFreetext(
    freetext: string,
    tracker: CostTracker
  ): Promise<Record<string, any>> {
    const systemPrompt = `You are a filter parser for a photography portfolio builder.
Given the user's free-text instructions, extract structured filters.

Return JSON with these optional fields:
- "excludeTags": string[] — subjects/objects to exclude (e.g. ["animal", "dog", "cat"])
- "includeTags": string[] — subjects/objects to prefer (e.g. ["portrait", "person"])
- "visualAspects": { genre?: string[], lighting?: string[], palette?: string[], ... } — photographic style filters
- "dateFrom": string (ISO) — earliest date
- "dateTo": string (ISO) — latest date
- "notes": string — any additional context for the LLM evaluator that doesn't fit into filters

Only include fields that are clearly indicated by the user's text. If nothing is extractable, return {}.`

    const trackedModels = createTrackedModelsService(this.modelsService, tracker)
    const result = await trackedModels.getGPTResponse(
      systemPrompt,
      freetext,
      PARSE_MODEL,
      { type: 'json_object' },
      0.3,
      false
    )

    console.log(
      `[PortfolioBuild] 📝 Parsed freetext: ${JSON.stringify(result.result).slice(0, 300)}`
    )
    return result.result ?? {}
  }

  // ── Step 2: Recall ─────────────────────────────────────────

  private async recall(
    userId: number,
    config: PortfolioBuildConfig,
    parsedFilters: Record<string, any> | null
  ): Promise<ScoredCandidate[]> {
    const allPhotos = await this.photoManager.getPhotosPreview(String(userId))

    // Filter to analyzed photos only
    let pool = allPhotos.filter(
      (p: any) => p.descriptions?.artistic_scores && p.status === 'processed'
    ) as PhotoPreview[]

    console.log(
      `[PortfolioBuild] 📸 Catalog: ${allPhotos.length} total, ${pool.length} analyzed/processed`
    )

    // Apply structured filters from config
    pool = this.applyConfigFilters(pool, config)

    // Apply parsed freetext filters
    if (parsedFilters) {
      pool = this.applyParsedFilters(pool, parsedFilters)
    }

    // Deduplicate by perceptual hash
    pool = await this.deduplicateByHash(pool, userId)

    // Rank by weighted composite score
    const scored = this.rankByCompositeScore(pool, config.weights)

    // Cap to recall limit
    const recallTarget = Math.min(config.targetSize * RECALL_MULTIPLIER, RECALL_MAX)
    const finalPool = scored.slice(0, recallTarget)

    console.log(
      `[PortfolioBuild] 🎯 Recall: ${pool.length} after filters → ${finalPool.length} candidates (target pool for ${config.targetSize} photos)`
    )

    return finalPool
  }

  private applyConfigFilters(pool: PhotoPreview[], config: PortfolioBuildConfig): PhotoPreview[] {
    const filters = config.filters
    if (!filters) return pool

    return pool.filter((p) => {
      // Visual aspects
      if (filters.visualAspects) {
        const va = p.descriptions.visual_aspects
        for (const [key, accepted] of Object.entries(filters.visualAspects)) {
          if (!accepted || accepted.length === 0) continue
          const photoVal = va?.[key]
          if (!photoVal) return false
          const photoVals = Array.isArray(photoVal) ? photoVal : [photoVal]
          if (!photoVals.some((v: string) => accepted.includes(v))) return false
        }
      }

      // Date filters
      if (filters.dateFrom || filters.dateTo) {
        const dateTaken = p.descriptions.EXIF?.dateTaken
        if (!dateTaken) return false
        if (filters.dateFrom && dateTaken < filters.dateFrom) return false
        if (filters.dateTo && dateTaken > filters.dateTo) return false
      }

      return true
    })
  }

  private applyParsedFilters(pool: PhotoPreview[], parsed: Record<string, any>): PhotoPreview[] {
    let result = pool

    // Exclude tags: remove photos whose descriptions match excluded subjects
    if (parsed.excludeTags && Array.isArray(parsed.excludeTags) && parsed.excludeTags.length > 0) {
      const excludeLower = parsed.excludeTags.map((t: string) => t.toLowerCase())
      result = result.filter((p) => {
        const va = p.descriptions.visual_aspects
        // Check all visual aspect values for excluded terms
        const allValues = Object.values(va || {})
          .flat()
          .filter(Boolean)
          .map((v: any) => String(v).toLowerCase())
        return !excludeLower.some((ex: string) => allValues.some((v: string) => v.includes(ex)))
      })
    }

    // Visual aspects from freetext
    if (parsed.visualAspects && typeof parsed.visualAspects === 'object') {
      result = result.filter((p) => {
        const va = p.descriptions.visual_aspects
        for (const [key, accepted] of Object.entries(parsed.visualAspects)) {
          if (!Array.isArray(accepted) || accepted.length === 0) continue
          const photoVal = va?.[key]
          if (!photoVal) return false
          const photoVals = Array.isArray(photoVal) ? photoVal : [photoVal]
          if (!photoVals.some((v: string) => (accepted as string[]).includes(v))) return false
        }
        return true
      })
    }

    // Date filters
    if (parsed.dateFrom || parsed.dateTo) {
      result = result.filter((p) => {
        const dateTaken = p.descriptions.EXIF?.dateTaken
        if (!dateTaken) return false
        if (parsed.dateFrom && dateTaken < parsed.dateFrom) return false
        if (parsed.dateTo && dateTaken > parsed.dateTo) return false
        return true
      })
    }

    return result
  }

  private async deduplicateByHash(pool: PhotoPreview[], userId: number): Promise<PhotoPreview[]> {
    if (pool.length < 2) return pool

    // Fetch dhash values for all candidates
    const photoIds = pool.map((p) => p.id)
    const photos = await Photo.query()
      .whereIn('id', photoIds)
      .where('user_id', userId)
      .whereNotNull('dhash')
      .select(['id', 'dhash'])

    const hashMap: Record<number, string> = {}
    for (const p of photos) {
      if (p.dhash) hashMap[p.id] = p.dhash
    }

    // Build a scored map for picking the best of each duplicate group
    const scoreMap = new Map(pool.map((p) => [p.id, (p as ScoredCandidate).compositeScore ?? 0]))

    // Use worker thread for pairwise comparison
    const photoHashes = Object.entries(hashMap).map(([id, hash]) => ({
      id: Number(id),
      hash,
    }))

    if (photoHashes.length < 2) return pool

    const duplicateGroups = await CpuWorkerPool.run<Record<number, number[]>>('dhash_compare', {
      photoHashes: photoHashes.map((ph) => ({ id: ph.id, hash: ph.hash })),
      photosToCheckIds: photoHashes.map((ph) => ph.id),
      threshold: DHASH_DUPLICATE_THRESHOLD,
    })

    // For each group of duplicates, keep only the one with the highest composite score
    const removedIds = new Set<number>()
    for (const [_sourceId, dupeIds] of Object.entries(duplicateGroups)) {
      const sourceId = Number(_sourceId)
      if (removedIds.has(sourceId)) continue
      for (const dupeId of dupeIds) {
        if (removedIds.has(dupeId)) continue
        const sourceScore = scoreMap.get(sourceId) ?? 0
        const dupeScore = scoreMap.get(dupeId) ?? 0
        if (dupeScore > sourceScore) {
          removedIds.add(sourceId)
        } else {
          removedIds.add(dupeId)
        }
      }
    }

    const before = pool.length
    const deduped = pool.filter((p) => !removedIds.has(p.id))
    if (removedIds.size > 0) {
      console.log(
        `[PortfolioBuild] 🔁 Dedup: ${before} → ${deduped.length} (removed ${removedIds.size} near-duplicates)`
      )
    }
    return deduped
  }

  private rankByCompositeScore(
    pool: PhotoPreview[],
    weights: Record<string, number>
  ): ScoredCandidate[] {
    const weightEntries = Object.entries(weights).filter(([_, w]) => w > 0)
    const totalWeight = weightEntries.reduce((sum, [_, w]) => sum + w, 0)
    if (totalWeight === 0) {
      // Fallback: equal weight on aesthetic_quality
      weightEntries.push(['aesthetic_quality', 1])
    }

    const scored: ScoredCandidate[] = pool.map((p) => {
      const scores = p.descriptions.artistic_scores
      if (!scores) return { ...p, compositeScore: 0 }

      let weightedSum = 0
      let usedWeight = 0
      for (const [field, weight] of weightEntries) {
        const internal = internalScoreField(field)
        const val = scores[internal]
        if (typeof val === 'number') {
          weightedSum += val * weight
          usedWeight += weight
        }
      }
      const compositeScore = usedWeight > 0 ? weightedSum / usedWeight : 0
      return { ...p, compositeScore }
    })

    // Sort descending by composite score
    scored.sort((a, b) => b.compositeScore - a.compositeScore)
    return scored
  }

  // ── Step 3: Coherence scoring ──────────────────────────────

  private async computeCoherenceScores(
    candidates: ScoredCandidate[],
    mode: CoherenceMode,
    userId: number
  ): Promise<void> {
    if (mode === 'free') return

    // Determine which vector field to use
    let vectorField: 'embedding' | 'color_histogram' | null = null
    if (mode === 'visual' || mode === 'heterogeneous') vectorField = 'embedding'
    if (mode === 'chromatic') vectorField = 'color_histogram'

    // For narrative coherence, we'd need description chunk embeddings which are
    // more complex. Use a simpler proxy: story+context text similarity via the
    // composite scores already available. For V1, we compute coherence only for
    // vector-based modes and pass narrative as a prompt modifier.
    if (mode === 'narrative') {
      // Mark all as having a neutral coherence score — the LLM prompt will
      // handle narrative coherence evaluation.
      for (const c of candidates) c.coherenceScore = 1.0
      return
    }

    if (!vectorField) return

    // Fetch vectors for top candidates (used as centroid anchors)
    const topN = Math.min(20, candidates.length)
    const topIds = candidates.slice(0, topN).map((c) => c.id)
    const allIds = candidates.map((c) => c.id)

    const column = vectorField === 'embedding' ? 'embedding' : 'color_histogram'
    const rows = await db
      .from('photos')
      .whereIn('id', allIds)
      .where('user_id', userId)
      .whereNotNull(column)
      .select('id', db.raw(`${column}::text as vec`))

    const vectorMap = new Map<number, number[]>()
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.vec.replace(/^\[/, '[').replace(/\]$/, ']'))
        if (Array.isArray(parsed)) vectorMap.set(row.id, parsed)
      } catch {}
    }

    // Compute centroid from top-N photos
    const topVectors = topIds.map((id) => vectorMap.get(id)).filter(Boolean) as number[][]
    if (topVectors.length === 0) return

    const dim = topVectors[0].length
    const centroid = new Array(dim).fill(0)
    for (const vec of topVectors) {
      for (let i = 0; i < dim; i++) centroid[i] += vec[i]
    }
    for (let i = 0; i < dim; i++) centroid[i] /= topVectors.length

    // Compute cosine similarity to centroid for each candidate
    const centroidNorm = Math.sqrt(centroid.reduce((s, v) => s + v * v, 0))
    for (const candidate of candidates) {
      const vec = vectorMap.get(candidate.id)
      if (!vec) {
        candidate.coherenceScore = 0.5 // neutral if no vector
        continue
      }
      let dot = 0
      let norm = 0
      for (let i = 0; i < dim; i++) {
        dot += centroid[i] * vec[i]
        norm += vec[i] * vec[i]
      }
      const similarity = centroidNorm > 0 && norm > 0 ? dot / (centroidNorm * Math.sqrt(norm)) : 0
      // Normalize to 0-1 range (cosine sim is already -1 to 1, but embeddings
      // are typically positive so it's usually 0-1)
      candidate.coherenceScore = Math.max(0, Math.min(1, similarity))

      // For heterogeneous mode, invert: we want diversity, not coherence
      if (mode === 'heterogeneous') {
        candidate.coherenceScore = 1 - candidate.coherenceScore
      }
    }

    console.log(
      `[PortfolioBuild] 🎨 Coherence (${mode}): computed for ${candidates.length} candidates using ${column}`
    )
  }

  // ── Step 4: LLM batch evaluation ──────────────────────────

  private async evaluateBatches(
    build: PortfolioBuild,
    candidates: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    tracker: CostTracker
  ): Promise<ScoredCandidate[]> {
    // Sort batches according to configured order
    const sorted = [...candidates]
    if (BATCH_ORDER === 'asc') sorted.reverse()

    const batches: ScoredCandidate[][] = []
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
      batches.push(sorted.slice(i, i + BATCH_SIZE))
    }

    const selected: ScoredCandidate[] = []
    const limit = pLimit(1) // Sequential — each batch depends on accumulated state

    console.log(
      `[PortfolioBuild] 🔄 Starting evaluation: ${batches.length} batches of ≤${BATCH_SIZE} photos | target: ${config.targetSize}`
    )

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      // Check if build was aborted
      const freshBuild = await PortfolioBuild.find(build.id)
      if (!freshBuild || freshBuild.status === 'failed') {
        console.log(`[PortfolioBuild] 🛑 Build ${build.id} aborted — stopping evaluation`)
        return selected
      }

      // Early stop
      if (EARLY_STOP && BATCH_ORDER === 'desc' && selected.length >= config.targetSize) {
        console.log(
          `[PortfolioBuild] ⏹️ Early stop: ${selected.length}/${config.targetSize} photos selected after ${batchIdx} batches`
        )
        break
      }

      const batch = batches[batchIdx]
      tracker.setCurrentTask(`evaluation_batch_${batchIdx}`)

      const decisions = await this.evaluateSingleBatch(
        batch,
        selected,
        config,
        trackedModels,
        build.parsedFilters
      )

      for (const decision of decisions) {
        if (decision.select) {
          const photo = batch.find((p) => p.id === decision.id)
          if (photo) selected.push(photo)
        }
      }

      // Update progress (10% to 85% during evaluation)
      const evalProgress = 10 + Math.round((batchIdx / batches.length) * 75)
      build.progress = evalProgress
      // Checkpoint: save partial results
      build.result = {
        photoIds: selected.map((p) => p.id),
        photoItems: selected.map((p) => ({ id: p.id, thumbnailUrl: p.thumbnailUrl })),
        recallSize: candidates.length,
        batchesEvaluated: batchIdx + 1,
        totalCandidatesEvaluated: (batchIdx + 1) * BATCH_SIZE,
      }
      await build.save()
      this.emitProgress(build)

      console.log(
        `[PortfolioBuild]   📦 Batch ${batchIdx + 1}/${batches.length}: ` +
          `+${decisions.filter((d) => d.select).length} selected | ` +
          `total: ${selected.length}/${config.targetSize}`
      )
    }

    // Trim to target size if we overshot
    return selected.slice(0, config.targetSize)
  }

  private async evaluateSingleBatch(
    batch: ScoredCandidate[],
    alreadySelected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    parsedFilters: Record<string, any> | null
  ): Promise<BatchDecision[]> {
    const photoImageService = PhotoImageService.getInstance()

    // Build the selected-so-far context (compact, no images)
    const selectedContext = alreadySelected
      .map(
        (p) =>
          `- id:${p.id} | ${p.originalFileName} | score:${p.compositeScore.toFixed(1)}` +
          (p.coherenceScore !== undefined ? ` | coherence:${p.coherenceScore.toFixed(2)}` : '') +
          ` | genre:${p.descriptions.visual_aspects?.genre ?? 'unknown'}`
      )
      .join('\n')

    // Build coherence mode instructions
    const coherenceInstruction = this.getCoherencePromptModifier(config.coherenceMode)

    // Build the freetext/notes section
    const userNotes = [
      config.freetext ? `User notes: "${config.freetext}"` : '',
      parsedFilters?.notes ? `Additional context: ${parsedFilters.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    // Build weight description
    const weightDesc = Object.entries(config.weights)
      .filter(([_, w]) => w > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([field, w]) => `${field}: ${w}/10`)
      .join(', ')

    const systemPrompt = `You are a portfolio curator evaluating photos for a photographer's portfolio.

## Task
Evaluate each candidate photo and decide whether to SELECT or REJECT it for the portfolio.

## Portfolio spec
- Target size: ${config.targetSize} photos
- Currently selected: ${alreadySelected.length}/${config.targetSize}
- Quality weights: ${weightDesc}
${userNotes ? `\n${userNotes}` : ''}
${coherenceInstruction ? `\n## Coherence directive\n${coherenceInstruction}` : ''}

## Already selected
${alreadySelected.length > 0 ? selectedContext : '(none yet)'}

## Evaluation criteria
1. Does the photo meet the quality bar implied by the weights?
2. Does it add VARIETY to the portfolio? Reject near-duplicates of already-selected photos.
3. Does it fit the user's stated theme/preferences?
${config.coherenceMode !== 'free' ? '4. Does it maintain the requested coherence (see coherence directive)?' : ''}

## Rules
- You may select 0 to ${batch.length} photos from this batch.
- Each photo has a thumbnail, metadata, and scores. Use all of them.
- Be selective. A smaller, stronger portfolio is better than a padded one.

Return a JSON object: { "decisions": [ { "id": <number>, "select": <boolean>, "reason": "<one sentence>" } ] }`

    // Build multimodal user content with thumbnails
    const userContent: any[] = [
      { type: 'text', text: `Evaluate these ${batch.length} candidate photos:` },
    ]

    for (const photo of batch) {
      const scores = photo.descriptions.artistic_scores
      const va = photo.descriptions.visual_aspects
      const meta =
        `[id:${photo.id} | ${photo.originalFileName}` +
        ` | composite:${photo.compositeScore.toFixed(1)}` +
        (photo.coherenceScore !== undefined
          ? ` | coherence:${photo.coherenceScore.toFixed(2)}`
          : '') +
        ` | scores:${scores ? JSON.stringify(scores) : 'N/A'}` +
        ` | genre:${va?.genre ?? 'unknown'} | lighting:${va?.lighting ?? 'unknown'}]`

      userContent.push({ type: 'text', text: meta })

      // Add thumbnail
      try {
        const url = photo.thumbnailUrl
        if (url) {
          userContent.push({ type: 'image_url', image_url: { url, detail: 'low' } })
        }
      } catch {}
    }

    const result = await trackedModels.getGPTResponse(
      systemPrompt,
      userContent,
      EVALUATION_MODEL,
      { type: 'json_object' },
      0.3,
      false
    )

    const decisions: BatchDecision[] = result.result?.decisions ?? []
    return decisions
  }

  private getCoherencePromptModifier(mode: CoherenceMode): string {
    switch (mode) {
      case 'visual':
        return 'The user wants VISUAL COHERENCE. Prefer photos with a consistent visual style, similar aesthetics, mood, and composition approach. The coherence score (0-1) indicates how close each photo is to the visual centroid of the top candidates. Prefer photos with high coherence scores.'
      case 'chromatic':
        return "The user wants CHROMATIC COHERENCE. Prefer photos with a consistent color palette — similar tones, temperature, and color mood. The coherence score indicates how close each photo's color palette is to the group centroid. Prefer photos with high coherence scores."
      case 'narrative':
        return 'The user wants NARRATIVE COHERENCE. Prefer photos that tell related stories or share thematic connections — similar settings, moods, or narrative threads. Reject photos that feel thematically disconnected from the emerging set.'
      case 'heterogeneous':
        return 'The user wants MAXIMUM DIVERSITY. Actively seek variety: different genres, subjects, moods, color palettes, and compositions. Reject photos that are too similar to any already-selected photo. The coherence score here is INVERTED — higher means MORE different from the group.'
      default:
        return ''
    }
  }

  // ── Step 5: Refinement ─────────────────────────────────────

  private async refinementPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    buildId: number
  ): Promise<string | undefined> {
    const coherenceInstruction = this.getCoherencePromptModifier(config.coherenceMode)

    const systemPrompt = `You are a portfolio curator doing a FINAL REVIEW of a completed portfolio selection.

## Task
Review the entire set of ${selected.length} selected photos as a whole. Evaluate:
1. **Diversity:** Are there too many similar photos? Identify redundancies.
2. **Gaps:** Are there obvious missing genres/themes given the photographer's catalog?
3. **Coherence:** Does the set feel like a unified portfolio, or a random collection?
4. **Weak links:** Are any photos noticeably weaker than the rest?
${coherenceInstruction ? `\n## Coherence mode\n${coherenceInstruction}` : ''}

Return JSON: { "notes": "<2-3 paragraphs of analysis>", "flagged_ids": [<ids of photos that could be swapped out>] }`

    const userContent: any[] = [
      { type: 'text', text: `Portfolio of ${selected.length} photos for review:` },
    ]

    // Optionally generate a grid image
    if (REFINEMENT_USE_GRID_IMAGE && selected.length > 4) {
      try {
        const gridBuffer = await this.generateGridImage(selected)
        if (gridBuffer) {
          if (DEBUG_SAVE_GRID) {
            try {
              const debugDir = path.join(process.cwd(), 'tmp', 'debug')
              await mkdir(debugDir, { recursive: true })
              const debugPath = path.join(debugDir, `portfolio_grid_${buildId}_${Date.now()}.jpg`)
              await writeFile(debugPath, gridBuffer)
              console.log(`[PortfolioBuild] 🐛 Debug grid saved: ${debugPath}`)
            } catch (debugErr) {
              console.warn(
                `[PortfolioBuild] ⚠️ Failed to save debug grid:`,
                (debugErr as Error).message
              )
            }
          }
          const base64 = gridBuffer.toString('base64')
          userContent.push({
            type: 'text',
            text: '[Grid overview of the entire portfolio — use this for a holistic visual impression]',
          })
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          })
        }
      } catch (err) {
        console.warn(
          `[PortfolioBuild] ⚠️ Grid generation failed, skipping:`,
          (err as Error).message
        )
      }
    }

    // Individual photo metadata
    for (const photo of selected) {
      const scores = photo.descriptions.artistic_scores
      const va = photo.descriptions.visual_aspects
      userContent.push({
        type: 'text',
        text:
          `[id:${photo.id} | ${photo.originalFileName}` +
          ` | composite:${photo.compositeScore.toFixed(1)}` +
          ` | scores:${scores ? JSON.stringify(scores) : 'N/A'}` +
          ` | genre:${va?.genre ?? 'unknown'}]`,
      })

      // Send individual thumbnails too (the grid is for holistic view)
      try {
        const url = photo.thumbnailUrl
        if (url) {
          userContent.push({ type: 'image_url', image_url: { url, detail: 'low' } })
        }
      } catch {}
    }

    const result = await trackedModels.getGPTResponse(
      systemPrompt,
      userContent,
      REFINEMENT_MODEL,
      { type: 'json_object' },
      0.5,
      false
    )

    const notes = result.result?.notes ?? undefined
    const flaggedIds = result.result?.flagged_ids ?? []
    if (flaggedIds.length > 0) {
      console.log(
        `[PortfolioBuild] 🏷️ Refinement flagged ${flaggedIds.length} photo(s): [${flaggedIds.join(', ')}]`
      )
    }

    return notes
  }

  // ── Step 6: Sequencing ─────────────────────────────────────

  private async sequencingPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService
  ): Promise<{ orderedIds: number[]; notes: string }> {
    const systemPrompt = `You are a portfolio sequencer. Given a set of selected photos for a photography portfolio, propose an optimal viewing ORDER.

Consider:
- **Opening impact:** Start strong to hook the viewer.
- **Flow:** Create visual rhythm — alternate between tight/wide, dark/bright, quiet/energetic.
- **Pacing:** Avoid clustering similar photos. Spread genres and moods.
- **Arc:** Build a narrative or emotional arc if possible.
- **Closing:** End on a memorable note.

Return JSON:
{
  "ordered_ids": [<all photo ids in your proposed order>],
  "notes": "<1-2 paragraphs explaining your sequencing logic>"
}`

    const userContent: any[] = [
      { type: 'text', text: `Sequence these ${selected.length} portfolio photos:` },
    ]

    for (const photo of selected) {
      const scores = photo.descriptions.artistic_scores
      const va = photo.descriptions.visual_aspects
      userContent.push({
        type: 'text',
        text:
          `[id:${photo.id} | ${photo.originalFileName}` +
          ` | scores:${scores ? JSON.stringify(scores) : 'N/A'}` +
          ` | genre:${va?.genre ?? 'unknown'} | lighting:${va?.lighting ?? 'unknown'}` +
          ` | palette:${va?.palette ?? 'unknown'}]`,
      })

      try {
        const url = photo.thumbnailUrl
        if (url) {
          userContent.push({ type: 'image_url', image_url: { url, detail: 'low' } })
        }
      } catch {}
    }

    const result = await trackedModels.getGPTResponse(
      systemPrompt,
      userContent,
      REFINEMENT_MODEL,
      { type: 'json_object' },
      0.5,
      false
    )

    const orderedIds: number[] = result.result?.ordered_ids ?? selected.map((p) => p.id)
    const notes: string = result.result?.notes ?? ''

    // Validate: ensure all IDs are present (LLM might drop some)
    const selectedIds = new Set(selected.map((p) => p.id))
    const validOrdered = orderedIds.filter((id: number) => selectedIds.has(id))
    // Append any missing IDs at the end
    for (const p of selected) {
      if (!validOrdered.includes(p.id)) validOrdered.push(p.id)
    }

    return { orderedIds: validOrdered, notes }
  }

  // ── Grid image generation ──────────────────────────────────

  private async generateGridImage(photos: ScoredCandidate[]): Promise<Buffer | null> {
    const photoImageService = PhotoImageService.getInstance()
    const maxPhotos = Math.min(photos.length, 64) // cap grid at 8×8
    const photosToGrid = photos.slice(0, maxPhotos)

    const cols = Math.ceil(Math.sqrt(maxPhotos))
    const rows = Math.ceil(maxPhotos / cols)
    const cellSize = GRID_CELL_SIZE

    // Download and resize thumbnails in parallel (limited concurrency)
    const limit = pLimit(10)
    const thumbnails = await Promise.all(
      photosToGrid.map((photo) =>
        limit(async () => {
          try {
            const buffer = await photoImageService.getImageBufferFromR2(
              photo.thumbnailUrl?.split('/').pop() ?? ''
            )
            if (!buffer) return null
            return sharp(buffer)
              .resize(cellSize, cellSize, {
                fit: 'contain',
                background: { r: 15, g: 23, b: 42 },
              })
              .flatten({ background: { r: 15, g: 23, b: 42 } })
              .jpeg({ quality: 85 })
              .toBuffer()
          } catch {
            return null
          }
        })
      )
    )

    // Compose grid
    const composites: sharp.OverlayOptions[] = []
    for (let i = 0; i < thumbnails.length; i++) {
      const thumb = thumbnails[i]
      if (!thumb) continue
      const col = i % cols
      const row = Math.floor(i / cols)
      composites.push({
        input: thumb,
        left: col * cellSize,
        top: row * cellSize,
      })
    }

    if (composites.length === 0) return null

    const gridBuffer = await sharp({
      create: {
        width: cols * cellSize,
        height: rows * cellSize,
        channels: 3,
        background: { r: 15, g: 23, b: 42 }, // Dark slate matching app theme
      },
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toBuffer()

    console.log(
      `[PortfolioBuild] 🖼️ Grid image: ${cols}×${rows} (${composites.length} photos, ${Math.round(gridBuffer.length / 1024)}KB)`
    )

    return gridBuffer
  }

  // ── Helpers ────────────────────────────────────────────────

  private async updateStatus(
    build: PortfolioBuild,
    status: PortfolioBuild['status'],
    progress: number
  ): Promise<void> {
    build.status = status
    build.progress = progress
    await build.save()
    this.emitProgress(build)
  }

  private emitProgress(build: PortfolioBuild): void {
    Ws.io?.to(build.userId.toString()).emit('portfolio-build:progress', {
      buildId: build.id,
      status: build.status,
      progress: build.progress,
      error: build.error ?? undefined,
      result: build.status === 'completed' ? build.result : undefined,
    })
  }

  private async notifyCompletion(build: PortfolioBuild): Promise<void> {
    try {
      const user = await User.find(build.userId)
      if (!user?.email) return

      const mailService = new MailService()
      const portfolioUrl = `${process.env.APP_URL ?? 'https://app.photoreka.com'}/portfolio-build/${build.id}`

      await mailService.sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: user.email,
        subject: '📸 Your portfolio is ready!',
        body: portfolioBuildCompleteTemplate(user.name ?? 'Photographer', {
          photoCount: build.result?.photoIds?.length ?? 0,
          targetSize: build.config.targetSize,
          recallSize: build.result?.recallSize ?? 0,
          costEur: build.costEur,
          portfolioUrl,
          hasSequencing: build.config.sequencing && !!build.result?.sequencingNotes,
        }),
      })
    } catch (err) {
      console.warn(`[PortfolioBuild] ⚠️ Email notification failed:`, (err as Error).message)
    }
  }

  // ── Validation ─────────────────────────────────────────────

  public async validateBuildEligibility(
    userId: number
  ): Promise<{ eligible: boolean; reason?: string; stats?: { total: number; analyzed: number } }> {
    const [totalResult, analyzedResult] = await Promise.all([
      Photo.query()
        .where('user_id', userId)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0)),
      Photo.query()
        .where('user_id', userId)
        .whereNotNull('descriptions')
        .whereRaw(`descriptions->>'artistic_scores' IS NOT NULL`)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0)),
    ])

    const stats = { total: totalResult, analyzed: analyzedResult }

    if (analyzedResult < MIN_TARGET_SIZE) {
      return {
        eligible: false,
        reason: `You need at least ${MIN_TARGET_SIZE} analyzed photos. Currently: ${analyzedResult}.`,
        stats,
      }
    }

    const ratio = totalResult > 0 ? analyzedResult / totalResult : 0
    if (ratio < MIN_ANALYZED_RATIO) {
      return {
        eligible: false,
        reason: `At least ${Math.round(MIN_ANALYZED_RATIO * 100)}% of your catalog must be analyzed. Currently: ${Math.round(ratio * 100)}% (${analyzedResult}/${totalResult}).`,
        stats,
      }
    }

    return { eligible: true, stats }
  }
}
