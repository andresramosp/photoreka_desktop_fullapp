import { DateTime } from 'luxon'
import sharp from 'sharp'
import pLimit from 'p-limit'
import axios from 'axios'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import PortfolioBuild from '#models/portfolio_build'
import type { PortfolioBuildConfig, CoherenceMode } from '#models/portfolio_build'
import Photo from '#models/photo'
import User from '#models/user'
import PhotoManager from '../managers/photo_manager.js'
import PhotoImageService from './photo_image_service.js'
import ModelsService, { PRICES, USD_TO_EUR } from './models_service.js'
import type { ModelName } from './models_service.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import UserCostService from './user_cost_service.js'
import CreditService from './credit_service.js'
import MailService from './mail_service.js'
import { portfolioBuildCompleteTemplate } from '../utils/email_templates.js'
import Ws from '#services/ws'
import db from '@adonisjs/lucid/services/db'
import CpuWorkerPool from './cpu_worker_pool.js'
import { DHASH_DUPLICATE_THRESHOLD } from '../utils/dhash.js'
import ScoringService from './scoring_service.js'
import type { SearchMode } from './search_text_service.js'
import {
  toInternalScoreKey,
  getStyleCriteriaDescriptionsForVariant,
  getPromptVariant,
  type PromptVariant,
} from '#config/photo_schema'

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const RECALL_MULTIPLIER = 7
/** Hard cap on the recall pool regardless of catalog size. */
const RECALL_MAX = 800
/** Photos sent to the LLM per evaluation batch. */
const BATCH_SIZE = 6
/** Process batches from highest to lowest composite score. */
const BATCH_ORDER: 'desc' | 'asc' = 'desc'
/** Max concurrent LLM evaluation batches. */
const EVAL_CONCURRENCY = 3
/** Evaluate batches sequentially and stop once the evaluation target is reached. */
const EARLY_STOP = true
/** LLM model for the heavy evaluation batches (must support vision). */
const EVALUATION_MODEL = 'gemini-3-flash-preview'
/** LLM model for the refinement pass (must support vision). */
const REFINEMENT_MODEL = 'gpt-5.1' //'gpt-5.1'
/** Cheap model used to parse freetext into structured filters. */
const PARSE_MODEL = 'gemini-3.1-flash-lite-preview'
/** Photos per batch in the iterative refinement pass. */
const REFINEMENT_BATCH_SIZE = 15
/** Max fraction of photos the LLM may flag per batch (~15%). */
const REFINEMENT_CUT_RATIO = 0.25
/** Max refinement rounds before force-trimming by composite score. */
const REFINEMENT_MAX_ROUNDS = 8
/** Whether the sequencing option is available at all. */
const ENABLE_SEQUENCING = true
/** Internal sequencing strategy. Switch to 'llm' to restore model-based ordering. */
const SEQUENCING_MODE: SequencingMode = 'computational'
/** Allowed target-size range. */
const MIN_PORTFOLIO_TARGET_SIZE = 10
const MAX_TARGET_SIZE = 60
/** Minimum ratio of analyzed photos (with artistic_scores) required to start a build. */
const MIN_ANALYZED_RATIO = 0.8
/** Grid thumbnail cell size in pixels. */
const GRID_CELL_SIZE = 280
/** Save debug artifacts (e.g. grid image) to disk. */
const DEBUG_SAVE_GRID = false
/** Save a grid image per evaluation batch for debugging. */
const DEBUG_SAVE_BATCH_GRID = false
/** Over-generate buffer: fraction of targetSize to over-select for refinement trimming. */
const OVER_GENERATE_RATIO = 0.35
/** Minimum over-generate buffer (absolute). */
const OVER_GENERATE_MIN = 3
/** Cosine similarity threshold — reject candidates too similar to already-selected photos. */
const SIMILARITY_GATE_THRESHOLD = 0.75
/** Commercial work often contains valid near-variants; allow more similarity before rejecting. */
const COMMERCIAL_SIMILARITY_GATE_THRESHOLD = 0.8
/** Max retries for LLM calls before giving up. */
const LLM_MAX_RETRIES = 3
/** Base delay in ms between retries (exponential backoff). */
const LLM_RETRY_BASE_DELAY_MS = 1500
/** CLIP similarity floor — below this, the photo is considered irrelevant to the phrase. */
const CLIP_SIM_FLOOR = 0.15
/** CLIP similarity ceiling — above this, the photo is considered a perfect match. */
const CLIP_SIM_CEIL = 0.35
/** Additive CLIP boost as a fraction of the composite scale (0–10). 0.5 → up to +5 points. */
const CLIP_BOOST_WEIGHT = 0.5
/** Max value of the composite score scale (artistic scores are 0–10). */
const COMPOSITE_SCALE = 10
/** Additive tag-based boost as a fraction of the composite scale (0–10). */
const TAG_BOOST_WEIGHT = 0.5
/** Additive coherence boost as a fraction of the composite scale (0–10). */
const COHERENCE_BOOST_WEIGHT = 0.5
/** Search mode used for tag-based scoring (broad captures more, curation is balanced). */
const TAG_SEARCH_MODE: SearchMode = 'broad'
/** How many recent photos the computational sequencer tries to diversify against. */
const COMPUTATIONAL_SEQUENCE_RECENT_WINDOW = 3
/** Hard cap for consecutive vertical photos in computational sequencing. */
const COMPUTATIONAL_SEQUENCE_MAX_VERTICAL_RUN = 2

// ── Style-preferences parsing (free-text → artistic weights) ─
/**
 * Default portfolio weight vector. This is the canonical starting point:
 * - Displayed in the wizard before the user types any style preference.
 * - Used as the baseline when the LLM applies emphasis/deemphasis boosts.
 *
 * Intentionally differs from the "general" genre preset: a portfolio should
 * already have above-average emphasis on quality, composition and originality;
 * the other criteria start low but can be boosted via style description.
 *
 * Scale: 0..1 (the frontend renders sliders in this range; weights are
 * multiplied ×10 before submission to the build pipeline).
 *
 * ⚠️  This is the single source of truth. The frontend fetches this via
 *     GET /api/portfolio-build/default-weights and must NOT hard-code it.
 */
const STYLE_BASELINE_WEIGHTS: Record<string, number> = {
  aesthetic_quality: 1, // portfolios demand visual excellence
  composition: 0.5, // strong framing is non-negotiable
  storytelling: 0.5, // narrative value matters more than in a casual gallery
  strangeness: 0.25, // originality is a differentiator (aliased from 'originality')
  message: 0, // low baseline; user can emphasize
  humor: 0, // low baseline; user can emphasize
  visual_games: 0, // low baseline; user can emphasize
  candidness: 0, // some candid presence valued by default
}

/**
 * Commercial baseline weights — different criteria set than style portfolios.
 * Uses commercial-specific keys (`commercial_intent`, `subject_clarity`)
 * instead of `message` / `visual_games`.
 */
const COMMERCIAL_BASELINE_WEIGHTS: Record<string, number> = {
  aesthetic_quality: 1, // commercial work demands polish
  composition: 0.7, // tightly designed framing matters
  storytelling: 0.3, // lifestyle narrative useful but optional
  strangeness: 0.2, // some differentiation; not the priority (aliased from 'originality')
  commercial_intent: 1, // core commercial criterion
  humor: 0, // low baseline; user can emphasize
  subject_clarity: 0.7, // hero subject readability is non-negotiable
  candidness: 0, // low baseline; user can emphasize
}

function getBaselineWeights(variant: PromptVariant): Record<string, number> {
  return variant === 'commercial'
    ? { ...COMMERCIAL_BASELINE_WEIGHTS }
    : { ...STYLE_BASELINE_WEIGHTS }
}
/** Value assigned to criteria the LLM flags as "emphasized". */
const STYLE_EMPHASIZE_VALUE = 1.0
/** Value assigned to criteria the LLM flags as "deemphasized". */
const STYLE_DEEMPHASIZE_VALUE = 0.1
/** Max number of criteria the LLM is allowed to emphasize. */
const STYLE_MAX_EMPHASIZE = 4
/** Max number of criteria the LLM is allowed to deemphasize. */
const STYLE_MAX_DEEMPHASIZE = 2

// STYLE_CRITERIA_DESCRIPTIONS is provided per-variant by
// `getStyleCriteriaDescriptionsForVariant` from '#config/photo_schema'.

// ── Score field mapping (mirrors agent_tools_service) ────────
/**
 * Maps external score field names (e.g. 'originality') to the internal
 * storage keys used throughout the pipeline (e.g. 'strangeness'), scoped to
 * the user's variant. Imported from the central photo schema.
 */
function internalScoreField(field: string, variant: PromptVariant): string {
  return toInternalScoreKey(field, variant)
}

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

type PhotoPreview = {
  id: number
  originalFileName: string
  thumbnailUrl: string
  descriptions: {
    context: string
    visual_aspects: Record<string, any>
    artistic_scores: Record<string, number> | null
    EXIF: Record<string, any>
    source: Record<string, any>
  }
}

type ScoredCandidate = PhotoPreview & {
  compositeScore: number
  coherenceScore?: number
  _embedding?: number[]
}

type BatchDecision = {
  id: number
  analysis: string
  select: boolean
}

type LLMProvider = 'openai' | 'gemini'
type SequencingMode = 'llm' | 'computational'
type PhotoOrientation = 'horizontal' | 'vertical' | 'square' | 'unknown'

// ══════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════

export default class PortfolioBuildService {
  private photoManager = new PhotoManager()
  private modelsService = new ModelsService()

  // ── Public API ──────────────────────────────────────────────

  /**
   * Start a portfolio build.
   * - `wait: false` (default): fire-and-forget, returns the build record immediately.
   * - `wait: true`: awaits full completion and returns the final build record.
   */
  public async startBuild(
    userId: number,
    config: PortfolioBuildConfig,
    wait = false
  ): Promise<PortfolioBuild> {
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

    if (wait) {
      await this.runBuild(build.id)
      return PortfolioBuild.findOrFail(build.id)
    }

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
   * Returns the canonical default weight vector (0..1 scale) that the wizard
   * should display before the user has entered any style preference. The
   * baseline is variant-aware: style/general portfolios use a different
   * criteria set than commercial portfolios.
   * Same baseline used internally when applying LLM emphasis boosts.
   */
  public static getDefaultWeights(userProfile?: string | null): Record<string, number> {
    const variant = getPromptVariant(userProfile)
    return getBaselineWeights(variant)
  }

  /**
   * Estimate the raw EUR cost (before margin) for a portfolio build config.
   *
   * Calibrated against observed builds:
   *   - 20-photo portfolio with visual coherence ≈ €0.10 observed raw cost.
   *   - A 20% safety buffer is applied (€0.006/photo instead of €0.005) to
   *     account for worst-case refinement rounds and prompt length variability.
   *
   * Does NOT include the CreditService margin — call `estimateCredits()` to
   * get the final credit amount charged to the user (which includes that margin).
   */
  private static estimateRawEur(
    config: Pick<
      PortfolioBuildConfig,
      'targetSize' | 'coherenceMode' | 'sequencing' | 'stylePreferences'
    >
  ): number {
    const N = config.targetSize

    // Base: €0.006/photo covers evaluation (Gemini Flash) + refinement (GPT).
    // Anchored at observed ~€0.005/photo, +20% buffer for worst-case rounds.
    let eur = 0.006 * N

    // Non-free coherence modes embed a directive in every LLM prompt,
    // slightly lengthening inputs and increasing the chance of extra
    // refinement rounds (+10%).
    if (config.coherenceMode && config.coherenceMode !== 'free') {
      eur *= 1.1
    }

    // LLM sequencing pass (currently computational, but hook for 'llm' mode).
    if (config.sequencing && SEQUENCING_MODE === 'llm') {
      eur *= 1.15
    }

    // Style/theme freetext parse is negligible but non-zero.
    if (config.stylePreferences) eur += 0.001

    // Safety floor for very small portfolios.
    return Math.max(eur, 0.05)
  }

  /**
   * Estimate the credit cost for a portfolio build, already including the
   * CreditService margin. This is the single source of truth shown in the
   * wizard — the frontend fetches it via GET /api/portfolio-build/estimate-credits.
   */
  public static estimateCredits(
    config: Pick<
      PortfolioBuildConfig,
      'targetSize' | 'coherenceMode' | 'sequencing' | 'stylePreferences'
    >
  ): number {
    return CreditService.eurToCredits(CreditService.applyMargin(this.estimateRawEur(config)))
  }

  /**
   * Create a manually-curated (empty) portfolio. No AI pipeline runs — the
   * user will add/remove photos through the detail view.
   */
  public async createManual(
    userId: number,
    name: string,
    description?: string
  ): Promise<PortfolioBuild> {
    const config: PortfolioBuildConfig = {
      name,
      ...(description ? { description } : {}),
      isManual: true,
      targetSize: 0,
      weights: {},
      coherenceMode: 'free',
      sequencing: false,
    }

    const now = DateTime.now()
    const build = await PortfolioBuild.create({
      userId,
      status: 'completed',
      config,
      progress: 100,
      costEur: 0,
      result: {
        photoIds: [],
        photoItems: [],
        recallSize: 0,
        batchesEvaluated: 0,
        totalCandidatesEvaluated: 0,
      },
      startedAt: now,
      completedAt: now,
    })
    return build
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

  /**
   * Parse a free-text style description into a weight vector by asking the
   * LLM for a sparse emphasize/deemphasize set and composing it with the
   * baseline preset.
   *
   * Returns weights in 0..1 range (same scale the frontend sliders expose).
   * Cost is small (PARSE_MODEL is our cheapest model). Safe to call from a
   * preview endpoint — it does not touch the build queue.
   */
  public async previewStyleWeights(
    stylePreferences: string,
    userProfile?: string | null
  ): Promise<{
    emphasize: string[]
    deemphasize: string[]
    weights: Record<string, number>
  }> {
    const tracker = new CostTracker('portfolio_build')
    const parsed = await this.parseStylePreferences(stylePreferences, tracker, userProfile)
    const variant = getPromptVariant(userProfile)
    const weights = this.computeStyleWeightsFromEmphasis(
      parsed.emphasize,
      parsed.deemphasize,
      variant
    )
    return { emphasize: parsed.emphasize, deemphasize: parsed.deemphasize, weights }
  }

  /**
   * LLM-backed parser for the style free-text. Produces a tightly constrained
   * JSON response describing which criteria to emphasize / deemphasize.
   */
  private async parseStylePreferences(
    stylePreferences: string,
    tracker: CostTracker,
    userProfile?: string | null
  ): Promise<{ emphasize: string[]; deemphasize: string[] }> {
    const variant = getPromptVariant(userProfile)
    const criteriaDescriptions = getStyleCriteriaDescriptionsForVariant(variant)
    const criteriaList = criteriaDescriptions
      .map((c) => `- "${c.key}" (${c.label}): ${c.desc}`)
      .join('\n')

    const allowedKeys = criteriaDescriptions.map((c) => c.key)

    const systemPrompt = `You map a user's free-text description of desired artistic style into a SPARSE set of artistic criteria to emphasize or deemphasize when ranking photos for a portfolio.

Available criteria:
${criteriaList}

Rules:
- Return JSON: { "emphasize": string[], "deemphasize": string[] }
- "emphasize": between 1 and ${STYLE_MAX_EMPHASIZE} criteria that best match what the user wants. Keep it tight — a portfolio needs marked, well-defined emphasis, not a vague boost on everything. Pick the 1–3 criteria that are most clearly implied; only use 4 if the user explicitly lists that many distinct qualities.
- "deemphasize": 0 to ${STYLE_MAX_DEEMPHASIZE} criteria, ONLY if the user explicitly says they do NOT want that quality (e.g. "not overly polished" → deemphasize aesthetic_quality). Otherwise return [].
- Use ONLY keys from the list above. No other strings.
- If the user's description is empty, vague, or purely thematic (e.g. mentions places or subjects only, no style cues), return { "emphasize": [], "deemphasize": [] } — the baseline will be used unchanged.
- Never emphasize and deemphasize the same key.
- Always in English keys regardless of the user's language.`

    const trackedModels = createTrackedModelsService(this.modelsService, tracker)
    let result: any
    try {
      const resp = await this.callLLMWithRetry(trackedModels, {
        systemPrompt,
        userContent: stylePreferences,
        model: PARSE_MODEL,
        temperature: 0.2,
      })
      result = resp.result ?? {}
    } catch (err: any) {
      console.warn(
        `[PortfolioBuild] ⚠️ style preferences parse failed, falling back to baseline: ${err.message}`
      )
      return { emphasize: [], deemphasize: [] }
    }

    const sanitizeList = (arr: any, max: number): string[] => {
      if (!Array.isArray(arr)) return []
      const out: string[] = []
      for (const k of arr) {
        if (typeof k !== 'string') continue
        if (!allowedKeys.includes(k)) continue
        if (out.includes(k)) continue
        out.push(k)
        if (out.length >= max) break
      }
      return out
    }

    const emphasize = sanitizeList(result.emphasize, STYLE_MAX_EMPHASIZE)
    let deemphasize = sanitizeList(result.deemphasize, STYLE_MAX_DEEMPHASIZE)
    // Guard against overlap.
    deemphasize = deemphasize.filter((k) => !emphasize.includes(k))

    console.log(
      `[PortfolioBuild] 🎚️ Parsed stylePreferences → emphasize=[${emphasize.join(', ')}] deemphasize=[${deemphasize.join(', ')}]`
    )
    return { emphasize, deemphasize }
  }

  /**
   * Compose a weight vector from the baseline preset plus emphasize /
   * deemphasize overrides. Emphasized criteria are pinned to the max value,
   * deemphasized criteria are suppressed but never zero (to avoid
   * omission-destructive behavior for the untouched majority).
   */
  private computeStyleWeightsFromEmphasis(
    emphasize: string[],
    deemphasize: string[],
    variant: PromptVariant
  ): Record<string, number> {
    // Map the LLM-facing keys (e.g. 'originality') to the internal score
    // field names used throughout the pipeline (e.g. 'strangeness').
    const toInternal = (k: string) => internalScoreField(k, variant)
    const emphasizeInternal = new Set(emphasize.map(toInternal))
    const deemphasizeInternal = new Set(deemphasize.map(toInternal))

    const baseline = getBaselineWeights(variant)
    const weights: Record<string, number> = {}
    for (const [k, value] of Object.entries(baseline)) {
      if (emphasizeInternal.has(k)) {
        weights[k] = STYLE_EMPHASIZE_VALUE
      } else if (deemphasizeInternal.has(k)) {
        weights[k] = STYLE_DEEMPHASIZE_VALUE
      } else {
        weights[k] = value
      }
    }
    return weights
  }

  // ── Main pipeline ──────────────────────────────────────────

  private async runBuild(buildId: number): Promise<void> {
    const build = await PortfolioBuild.findOrFail(buildId)
    const config = build.config
    const tracker = new CostTracker('portfolio_build')
    const buildUser = await User.find(build.userId)
    const userProfile = buildUser?.profiles ?? null
    const variant: PromptVariant = getPromptVariant(userProfile)

    try {
      build.startedAt = DateTime.now()
      build.status = 'parsing'
      await build.save()
      this.emitProgress(build)

      // ── Step 1: Parse themePreferences ──
      console.log(
        `[PortfolioBuild] 🔍 [Step 1/7] Parsing themePreferences${config.themePreferences ? `: "${config.themePreferences.slice(0, 80)}"` : ' (skipped — no themePreferences)'}`
      )
      tracker.setCurrentTask('parse_themePreferences')
      const parsedFilters = config.themePreferences
        ? await this.parseUserFreetext(config.themePreferences, tracker)
        : null
      build.parsedFilters = parsedFilters
      await build.save()

      // ── Step 2: Recall ──
      console.log(
        `[PortfolioBuild] 📂 [Step 2/7] Recall — building candidate pool (target: ${config.targetSize}, multiplier: ×${RECALL_MULTIPLIER}, cap: ${RECALL_MAX})`
      )
      await this.updateStatus(build, 'recall', 5)
      const candidates = await this.recall(build.userId, config, parsedFilters, variant)
      if (candidates.length === 0) {
        throw new Error('No eligible photos found after recall. Ensure your catalog is analyzed.')
      }

      // Publish recall size so the UI can show "pool of N candidates".
      build.result = {
        ...(build.result ?? {}),
        photoIds: build.result?.photoIds ?? [],
        recallSize: candidates.length,
        batchesEvaluated: 0,
        totalCandidatesEvaluated: 0,
      }
      await build.save()
      this.emitProgress(build)

      // ── Step 3: Compute coherence scores ──
      console.log(
        `[PortfolioBuild] 🎨 [Step 3/7] Coherence scoring — mode: ${config.coherenceMode}`
      )
      if (config.coherenceMode !== 'free') {
        await this.computeCoherenceScores(candidates, config.coherenceMode, build.userId)
      }

      // ── Step 3b: Load embeddings for similarity gate ──
      const similarityGateThreshold = this.getSimilarityGateThreshold(variant)
      console.log(
        `[PortfolioBuild] 🧲 [Step 3b/7] Loading embeddings for similarity gate (${candidates.length} candidates, threshold: ${similarityGateThreshold})`
      )
      await this.loadCandidateEmbeddings(candidates, build.userId)

      // ── Step 4: Evaluate batches (over-generate for refinement trim) ──
      console.log(
        `[PortfolioBuild] 🤖 [Step 4/7] LLM batch evaluation — ${candidates.length} candidates, batch size: ${BATCH_SIZE}, eval target: ${config.targetSize + Math.max(OVER_GENERATE_MIN, Math.ceil(config.targetSize * OVER_GENERATE_RATIO))} (over-generate), model: ${EVALUATION_MODEL}`
      )
      await this.updateStatus(build, 'evaluating', 10)
      const trackedModels = createTrackedModelsService(this.modelsService, tracker)
      const overBuffer = Math.max(
        OVER_GENERATE_MIN,
        Math.ceil(config.targetSize * OVER_GENERATE_RATIO)
      )
      const evaluationTarget = config.targetSize + overBuffer
      const evalOutcome = await this.evaluateBatches(
        build,
        candidates,
        config,
        trackedModels,
        tracker,
        evaluationTarget,
        variant
      )
      let selected = evalOutcome.gated
      const llmApproved = evalOutcome.allSelected

      // ── Step 5: Refinement (iterative trim to target) ──
      let refinementNotes: string | undefined
      if (selected.length > 0 && selected.length > config.targetSize) {
        console.log(
          `[PortfolioBuild] ✂️ [Step 5/7] Iterative refinement — ${selected.length} selected, trimming to target ${config.targetSize}, model: ${REFINEMENT_MODEL}`
        )
        await this.updateStatus(build, 'refining', 85)
        tracker.setCurrentTask('refinement')
        const refinement = await this.refinementPass(selected, config, trackedModels, build)
        selected = refinement.remaining
        refinementNotes = refinement.notes
      }

      // ── Step 6: Sequencing (optional) ──
      let sequencingNotes: string | undefined
      let finalIds = selected.map((p) => p.id)
      if (ENABLE_SEQUENCING && selected.length > 1) {
        console.log(
          `[PortfolioBuild] 🔢 [Step 6/7] Sequencing — ordering ${selected.length} photos, model: ${REFINEMENT_MODEL}`
        )
        await this.updateStatus(build, 'sequencing', 92)
        tracker.setCurrentTask('sequencing')
        const seqResult = await this.sequencingPass(selected, config, trackedModels)
        finalIds = seqResult.orderedIds
        sequencingNotes = seqResult.notes
      }

      // ── Step 7: Generate final portfolio grid image ──
      console.log(
        `[PortfolioBuild] 🖼️ [Step 7/7] Generating final portfolio grid image (${selected.length} photos)`
      )
      let gridImagePath: string | undefined
      if (DEBUG_SAVE_GRID && selected.length > 0) {
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
      // Builder pool: photos the LLM approved but that didn't make the final
      // cut (trimmed by similarity gate, over-generation buffer, or refinement).
      // Rejected photos (LLM said select=false) are intentionally excluded.
      const finalIdSet = new Set(finalIds)
      const builderPool = llmApproved
        .filter((p) => !finalIdSet.has(p.id))
        .map((p) => ({
          id: p.id,
          thumbnailUrl: p.thumbnailUrl,
          originalUrl: (p as any).originalUrl as string | undefined,
        }))

      build.result = {
        photoIds: finalIds,
        photoItems: finalIds.map((id) => {
          const photo = selected.find((p) => p.id === id)
          return {
            id,
            thumbnailUrl: photo?.thumbnailUrl ?? '',
            originalUrl: (photo as any)?.originalUrl as string | undefined,
          }
        }),
        recallSize: candidates.length,
        batchesEvaluated: Math.ceil(candidates.length / BATCH_SIZE),
        totalCandidatesEvaluated: candidates.length,
        refinementNotes,
        sequencingNotes,
        gridImagePath,
        builderPool,
      }
      await build.save()
      this.emitProgress(build)

      // Record cost & charge credits
      UserCostService.recordFromTracker(build.userId, tracker, String(build.id)).catch(() => {})

      // Charge the actual LLM cost with the standard 30% commercial margin.
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

      UserCostService.recordFromTracker(build.userId, tracker, String(build.id)).catch(() => {})

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
- "preferred": string — a descriptive English phrase of what the user WANTS to see (e.g. "European cities, urban architecture, city streets at night"). Compose a natural, descriptive sentence — not a tag list. Always in English despite user's language.
- "searchTags": string[] — a list of 2-4 short English search tags that capture the subjects, content, themes, and places the user wants. These will be used for semantic tag matching against the photo catalog. Be specific and varied (e.g. ["European city", "urban architecture", "cobblestone street", "cathedral", "old town", "European skyline"]). Always in English.

IMPORTANT: "preferred" describes SUBJECTS, CONTENT, THEMES, and PLACES — not photographic style.
Only include fields that are clearly indicated by the user's text. If nothing is extractable, return {}.`

    const trackedModels = createTrackedModelsService(this.modelsService, tracker)
    const result = await this.callLLMWithRetry(trackedModels, {
      systemPrompt,
      userContent: freetext,
      model: PARSE_MODEL,
      temperature: 0.3,
    })

    console.log(
      `[PortfolioBuild] 📝 Parsed themePreferences: ${JSON.stringify(result.result).slice(0, 300)}`
    )
    return result.result ?? {}
  }

  // ── Step 2: Recall ─────────────────────────────────────────

  private async recall(
    userId: number,
    config: PortfolioBuildConfig,
    parsedFilters: Record<string, any> | null,
    variant: PromptVariant
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
    pool = await this.applyConfigFilters(pool, config)

    // Deduplicate by perceptual hash
    pool = await this.deduplicateByHash(pool, userId)

    // Rank by weighted composite score
    const scored = this.rankByCompositeScore(pool, config.weights, variant)

    // Apply CLIP semantic boost for preferred content
    // if (parsedFilters?.preferred) {
    //   await this.applyClipBoost(scored, parsedFilters.preferred, userId)
    // }

    // // Apply tag-based semantic boost (multi-signal: tags + CLIP image)
    if (parsedFilters?.searchTags?.length) {
      await this.applyTagBoost(scored, parsedFilters.searchTags, userId)
    }

    // Cap to recall limit
    const recallTarget = Math.min(config.targetSize * RECALL_MULTIPLIER, RECALL_MAX)
    const finalPool = scored.slice(0, recallTarget)

    console.log(
      `[PortfolioBuild] 🎯 Recall: ${pool.length} after filters → ${finalPool.length} candidates (target pool for ${config.targetSize} photos)`
    )

    return finalPool
  }

  private async applyConfigFilters(
    pool: PhotoPreview[],
    config: PortfolioBuildConfig
  ): Promise<PhotoPreview[]> {
    const filters = config.filters
    if (!filters) return pool

    // Collection filter: restrict to photos in specified collections
    if (filters.collectionIds?.length) {
      const collectionPhotoIds = await this.getPhotoIdsInCollections(
        filters.collectionIds,
        pool.map((p) => p.id)
      )
      pool = pool.filter((p) => collectionPhotoIds.has(p.id))
      console.log(
        `[PortfolioBuild] 📁 Collection filter: ${filters.collectionIds.length} collection(s) → ${pool.length} photos`
      )
    }

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

  private async getPhotoIdsInCollections(
    collectionIds: number[],
    candidatePhotoIds: number[]
  ): Promise<Set<number>> {
    const rows = await db
      .from('collection_photos')
      .whereIn('collection_id', collectionIds)
      .whereIn('photo_id', candidatePhotoIds)
      .select('photo_id')
    return new Set(rows.map((r: any) => r.photo_id))
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
    weights: Record<string, number>,
    variant: PromptVariant
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
        const internal = internalScoreField(field, variant)
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

  // ── CLIP semantic boost / penalty ──────────────────────────

  private async applyClipBoost(
    candidates: ScoredCandidate[],
    preferred: string,
    userId: number
  ): Promise<void> {
    if (candidates.length === 0) return

    let embeddings: number[][]
    try {
      const clipResponse = await this.modelsService.getCLIPEmbeddingsCPU([preferred])
      embeddings = clipResponse?.embeddings
      if (!embeddings || embeddings.length !== 1) {
        console.warn('[PortfolioBuild] ⚠️ Failed to compute CLIP embedding for preferred phrase')
        return
      }
    } catch (err) {
      console.warn('[PortfolioBuild] ⚠️ CLIP embedding call failed:', (err as Error).message)
      return
    }

    const preferredEmbedding = embeddings[0]
    const literal = `[${preferredEmbedding.join(',')}]`

    const candidateIds = candidates.map((c) => c.id)
    const rows = await db
      .from('photos')
      .whereIn('id', candidateIds)
      .where('user_id', userId)
      .whereNotNull('embedding')
      .select('id', db.raw('1 - (embedding <=> ?::vector) as pref_sim', [literal]))

    // Remap raw cosine similarity [CLIP_SIM_FLOOR, CLIP_SIM_CEIL] → [0, 1]
    const remap = (raw: number): number => {
      if (raw <= CLIP_SIM_FLOOR) return 0
      if (raw >= CLIP_SIM_CEIL) return 1
      return (raw - CLIP_SIM_FLOOR) / (CLIP_SIM_CEIL - CLIP_SIM_FLOOR)
    }

    const simMap = new Map<number, number>()
    for (const row of rows) {
      simMap.set(row.id, Math.max(0, Number(row.pref_sim) || 0))
    }

    // Additive boost: up to CLIP_BOOST_WEIGHT × COMPOSITE_SCALE extra points
    const maxBoost = CLIP_BOOST_WEIGHT * COMPOSITE_SCALE
    for (const candidate of candidates) {
      const rawSim = simMap.get(candidate.id) ?? 0
      const remapped = remap(rawSim)
      candidate.compositeScore += maxBoost * remapped
    }

    // Re-sort by adjusted composite score
    candidates.sort((a, b) => b.compositeScore - a.compositeScore)

    // Logging
    const rawVals = [...simMap.values()]
    const remappedVals = rawVals.map(remap)
    const avgRaw = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length : 0
    const avgRemapped =
      remappedVals.length > 0 ? remappedVals.reduce((s, v) => s + v, 0) / remappedVals.length : 0
    const aboveFloor = remappedVals.filter((v) => v > 0).length
    console.log(
      `[PortfolioBuild] 🏷️ CLIP boost: "${preferred.slice(0, 60)}" | ` +
        `avg_raw: ${avgRaw.toFixed(3)}, avg_remapped: ${avgRemapped.toFixed(3)} | ` +
        `${aboveFloor}/${rawVals.length} above floor (${CLIP_SIM_FLOOR}) | ` +
        `max_boost: +${maxBoost.toFixed(1)}pts`
    )
  }

  // ── Tag-based semantic boost (via ScoringService) ─────────

  private async applyTagBoost(
    candidates: ScoredCandidate[],
    searchTags: string[],
    userId: number
  ): Promise<void> {
    if (candidates.length === 0 || searchTags.length === 0) return

    const scoringService = new ScoringService()
    const candidateIds = candidates.map((c) => c.id)

    try {
      const scoredPhotos = await scoringService.getScoredPhotosByTags(
        candidateIds,
        searchTags,
        [],
        TAG_SEARCH_MODE,
        String(userId)
      )

      if (!scoredPhotos || scoredPhotos.length === 0) {
        console.log(`[PortfolioBuild] 🏷️ Tag boost: no matches for [${searchTags.join(', ')}]`)
        return
      }

      // Normalize totalScore to [0, 1] range
      const maxTotal = Math.max(...scoredPhotos.map((s) => s.totalScore ?? 0))
      if (maxTotal <= 0) return

      const scoreMap = new Map<number, number>()
      for (const sp of scoredPhotos) {
        const normalized = (sp.totalScore ?? 0) / maxTotal
        scoreMap.set(sp.id, normalized)
      }

      // Additive boost: up to TAG_BOOST_WEIGHT × COMPOSITE_SCALE extra points
      const maxBoost = TAG_BOOST_WEIGHT * COMPOSITE_SCALE
      for (const candidate of candidates) {
        const normalized = scoreMap.get(candidate.id) ?? 0
        candidate.compositeScore += maxBoost * normalized
      }

      // Re-sort
      candidates.sort((a, b) => b.compositeScore - a.compositeScore)

      const matched = scoredPhotos.length
      const avgNorm = [...scoreMap.values()].reduce((s, v) => s + v, 0) / scoreMap.size
      console.log(
        `[PortfolioBuild] 🏷️ Tag boost: [${searchTags.slice(0, 5).join(', ')}${searchTags.length > 5 ? '...' : ''}] | ` +
          `${matched}/${candidates.length} matched | avg_norm: ${avgNorm.toFixed(3)} | ` +
          `max_boost: +${maxBoost.toFixed(1)}pts`
      )
    } catch (err) {
      console.warn('[PortfolioBuild] ⚠️ Tag boost failed:', (err as Error).message)
    }
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

    const maxBoost = COHERENCE_BOOST_WEIGHT * COMPOSITE_SCALE
    for (const candidate of candidates) {
      const coherenceScore = candidate.coherenceScore
      if (typeof coherenceScore === 'number') {
        candidate.compositeScore += maxBoost * coherenceScore
      }
    }

    candidates.sort((a, b) => b.compositeScore - a.compositeScore)

    const coherenceValues = candidates
      .map((candidate) => candidate.coherenceScore)
      .filter((value): value is number => typeof value === 'number')
    const avgCoherence =
      coherenceValues.length > 0
        ? coherenceValues.reduce((sum, value) => sum + value, 0) / coherenceValues.length
        : 0

    console.log(
      `[PortfolioBuild] 🎨 Coherence (${mode}): computed for ${candidates.length} candidates using ${column} | ` +
        `avg: ${avgCoherence.toFixed(3)} | max_boost: +${maxBoost.toFixed(1)}pts`
    )
  }

  // ── Embedding loading for similarity gate ─────────────────

  private async loadCandidateEmbeddings(
    candidates: ScoredCandidate[],
    userId: number
  ): Promise<void> {
    const candidateMap = new Map(candidates.map((c) => [c.id, c]))
    const allIds = candidates.map((c) => c.id)
    const rows = await db
      .from('photos')
      .whereIn('id', allIds)
      .where('user_id', userId)
      .whereNotNull('embedding')
      .select('id', db.raw('embedding::text as vec'))

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.vec)
        if (Array.isArray(parsed)) {
          const candidate = candidateMap.get(row.id)
          if (candidate) candidate._embedding = parsed
        }
      } catch {}
    }

    const loaded = candidates.filter((c) => c._embedding).length
    console.log(
      `[PortfolioBuild] 🧲 Loaded embeddings for ${loaded}/${candidates.length} candidates (similarity gate)`
    )
  }

  // ── Step 4: LLM batch evaluation ──────────────────────────

  private async evaluateBatches(
    build: PortfolioBuild,
    candidates: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    tracker: CostTracker,
    evaluationTarget: number,
    variant: PromptVariant
  ): Promise<{ gated: ScoredCandidate[]; allSelected: ScoredCandidate[] }> {
    // Sort batches according to configured order
    const sorted = [...candidates]
    if (BATCH_ORDER === 'asc') sorted.reverse()
    const similarityGateThreshold = this.getSimilarityGateThreshold(variant)

    const batches: ScoredCandidate[][] = []
    for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
      batches.push(sorted.slice(i, i + BATCH_SIZE))
    }

    let completedBatches = 0
    let evaluatedCandidates = 0
    let aborted = false

    const applySimilarityGate = (selectedCandidates: ScoredCandidate[]): ScoredCandidate[] => {
      const gated: ScoredCandidate[] = []

      for (const candidate of [...selectedCandidates].sort(
        (a, b) => b.compositeScore - a.compositeScore
      )) {
        if (this.checkSimilarityGate(candidate, gated, similarityGateThreshold)) {
          gated.push(candidate)
        }
      }

      return gated
    }

    const appendSelectedDecisions = (
      batch: ScoredCandidate[],
      decisions: BatchDecision[],
      selectedCandidates: ScoredCandidate[]
    ) => {
      for (const decision of decisions) {
        if (!decision.select) continue
        const photo = batch.find((candidate) => candidate.id === decision.id)
        if (photo) selectedCandidates.push(photo)
      }
    }

    const processBatch = async (batch: ScoredCandidate[], batchIdx: number) => {
      // Check if build was aborted
      if (aborted) return { batch, decisions: [] as BatchDecision[] }
      const freshBuild = await PortfolioBuild.find(build.id)
      if (!freshBuild || freshBuild.status === 'failed') {
        aborted = true
        console.log(`[PortfolioBuild] 🛑 Build ${build.id} aborted — stopping evaluation`)
        return { batch, decisions: [] as BatchDecision[] }
      }

      tracker.setCurrentTask(`evaluation_batch_${batchIdx}`)

      // Debug: save batch grid image
      if (DEBUG_SAVE_BATCH_GRID) {
        try {
          const gridBuffer = await this.generateGridImage(batch)
          if (gridBuffer) {
            const gridDir = path.join(process.cwd(), 'tmp', 'debug')
            await mkdir(gridDir, { recursive: true })
            const gridPath = path.join(
              gridDir,
              `portfolio_batch_${build.id}_${batchIdx}_${Date.now()}.jpg`
            )
            await writeFile(gridPath, gridBuffer)
            console.log(
              `[PortfolioBuild] 🖼️ Batch ${batchIdx + 1} grid saved: ${gridPath} (${Math.round(gridBuffer.length / 1024)}KB)`
            )
          }
        } catch (err) {
          console.warn(
            `[PortfolioBuild] ⚠️ Batch ${batchIdx + 1} grid generation failed:`,
            (err as Error).message
          )
        }
      }

      let decisions: BatchDecision[] = []
      try {
        decisions = await this.evaluateSingleBatch(
          batch,
          config,
          trackedModels,
          evaluationTarget,
          variant
        )
      } catch (err: any) {
        console.warn(
          `[PortfolioBuild] ⚠️ Batch ${batchIdx + 1}/${batches.length} failed after retries, skipping: ${err.message}`
        )
      }

      const completedCount = ++completedBatches
      evaluatedCandidates += batch.length
      const evalProgress = 10 + Math.round((completedCount / batches.length) * 75)
      build.progress = evalProgress
      build.result = {
        ...(build.result ?? {}),
        photoIds: build.result?.photoIds ?? [],
        recallSize: build.result?.recallSize ?? candidates.length,
        batchesEvaluated: completedCount,
        totalCandidatesEvaluated: evaluatedCandidates,
        evaluationProgress: { completed: completedCount, total: batches.length },
      }
      await build.save()
      this.emitProgress(build)

      console.log(
        `[PortfolioBuild]   📦 Batch ${batchIdx + 1}/${batches.length}: ` +
          `+${decisions.filter((d) => d.select).length} selected | ` +
          `completed: ${completedCount}/${batches.length}`
      )

      return { batch, decisions }
    }

    console.log(
      `[PortfolioBuild] 🔄 Starting evaluation: ${batches.length} batches of ≤${BATCH_SIZE} photos | ` +
        `${EARLY_STOP ? 'mode: early-stop sequential' : `concurrency: ${EVAL_CONCURRENCY}`} | ` +
        `eval target: ${evaluationTarget} (final: ${config.targetSize})`
    )

    const batchResults: Array<{ batch: ScoredCandidate[]; decisions: BatchDecision[] }> = []
    const allSelected: ScoredCandidate[] = []
    let gated: ScoredCandidate[] = []
    let nextBatchIdx = 0

    if (EARLY_STOP) {
      for (; nextBatchIdx < batches.length; nextBatchIdx++) {
        const batchResult = await processBatch(batches[nextBatchIdx], nextBatchIdx)
        batchResults.push(batchResult)

        appendSelectedDecisions(batchResult.batch, batchResult.decisions, allSelected)

        const rawSelectedCount = allSelected.length
        gated = applySimilarityGate(allSelected)
        const gatedCount = gated.length
        console.log(
          `[PortfolioBuild]   📊 Running totals after batch ${nextBatchIdx + 1}/${batches.length}: ` +
            `${rawSelectedCount} raw selected, ${gatedCount} after similarity gate (target: ${evaluationTarget})`
        )

        if (gatedCount >= evaluationTarget) {
          console.log(
            `[PortfolioBuild] 🛑 Early stop reached after batch ${nextBatchIdx + 1}/${batches.length}: ` +
              `${rawSelectedCount} raw selections, ${gatedCount} after similarity gate (target: ${evaluationTarget})`
          )
          nextBatchIdx++
          break
        }
      }

      if (!aborted && gated.length < evaluationTarget) {
        console.log(
          `[PortfolioBuild] ℹ️ Evaluation exhausted available batches: ${gated.length}/${evaluationTarget} gated selections`
        )
      }
    } else {
      const limit = pLimit(EVAL_CONCURRENCY)
      const concurrentResults = await Promise.all(
        batches.map((batch, batchIdx) => limit(async () => processBatch(batch, batchIdx)))
      )
      batchResults.push(...concurrentResults)

      for (const { batch, decisions } of batchResults) {
        appendSelectedDecisions(batch, decisions, allSelected)
      }

      gated = applySimilarityGate(allSelected)
    }

    const gatedIdSet = new Set(gated.map((candidate) => candidate.id))
    for (const candidate of [...allSelected].sort((a, b) => b.compositeScore - a.compositeScore)) {
      if (!gatedIdSet.has(candidate.id)) {
        console.log(
          `[PortfolioBuild] 🚫 Similarity gate rejected id:${candidate.id} (sim > ${similarityGateThreshold.toFixed(2)})`
        )
      }
    }

    // Checkpoint: save post-gate results
    build.result = {
      ...(build.result ?? {}),
      photoIds: gated.map((p) => p.id),
      photoItems: gated.map((p) => ({
        id: p.id,
        thumbnailUrl: p.thumbnailUrl,
        originalUrl: (p as any).originalUrl as string | undefined,
      })),
      recallSize: candidates.length,
      batchesEvaluated: completedBatches,
      totalCandidatesEvaluated: evaluatedCandidates,
      evaluationProgress: { completed: completedBatches, total: batches.length },
    }
    await build.save()
    this.emitProgress(build)

    console.log(
      `[PortfolioBuild] ✅ Evaluation done: ${allSelected.length} LLM-selected → ${gated.length} after similarity gate (target: ${evaluationTarget})`
    )

    // Trim to evaluation target if we overshot
    return {
      gated: gated.slice(0, evaluationTarget),
      allSelected,
    }
  }

  private async evaluateSingleBatch(
    batch: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    evaluationTarget: number,
    variant: PromptVariant
  ): Promise<BatchDecision[]> {
    const coherenceInstruction = this.getCoherencePromptModifier(config.coherenceMode)
    const themeNote = config.themePreferences
      ? `\n## Theme preferences\n"${config.themePreferences}"`
      : ''
    const styleNote = config.stylePreferences
      ? `\n## Style preferences\n"${config.stylePreferences}"`
      : ''
    const userNotes = themeNote + styleNote

    const profileContext =
      variant === 'commercial'
        ? 'You are curating a COMMERCIAL portfolio (advertising / stock / fashion / editorial / lifestyle / product / food). Judge each photo as a commercial asset: visual polish, clarity of subject, marketability, brand-friendliness.'
        : 'You are curating a portfolio of street, documentary or artistic photography. Judge each photo on visual craft, narrative strength and authorial voice.'

    const systemPrompt = `You are a portfolio curator. Look at each photo and decide: SELECT or REJECT.

## Context
${profileContext}

## Goal
Pick photos worthy of a ${evaluationTarget}-photo professional portfolio.
${userNotes}
${coherenceInstruction ? `\n## Coherence directive\n${coherenceInstruction}` : ''}

## Rules
- Judge each photo visually: composition, impact, technical quality, emotional resonance.
- Be selective — a smaller, stronger portfolio beats a padded one.
- Duplicates are handled separately; focus on individual photo merit.

Return JSON: { "decisions": [ { "id": <number>, "analysis": "<one sentence assessing this photo's merit>", "select": <boolean> } ] }`

    const { userContent, unavailableImageIds } = await this.buildVisionUserContent(
      'evaluation',
      `Evaluate these ${batch.length} candidate photos:`,
      batch,
      EVALUATION_MODEL
    )

    const result = await this.callLLMWithRetry(trackedModels, {
      systemPrompt,
      userContent,
      model: EVALUATION_MODEL,
      temperature: 0.3,
    })

    const decisions: BatchDecision[] = result.result?.decisions ?? []
    return this.normalizeBatchDecisions(batch, decisions, unavailableImageIds, 'evaluation')
  }

  private getCoherencePromptModifier(mode: CoherenceMode): string {
    switch (mode) {
      case 'visual':
        return 'Emphasize visual coherence based only on the image: favor photos with a consistent visual style, mood, and composition.'
      case 'chromatic':
        return 'Emphasize chromatic coherence based only on the image: favor photos with a consistent color palette, temperature, and color mood.'
      case 'narrative':
        return 'Emphasize narrative coherence based only on the image: favor photos that suggest related situations, settings, or emotional tone through visual cues.'
      case 'heterogeneous':
        return 'Emphasize visual diversity based only on the image: favor photos that clearly differ in subject, mood, palette, and composition.'
      default:
        return ''
    }
  }

  // ── Step 5: Iterative refinement ──────────────────────────

  private async refinementPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    build: PortfolioBuild
  ): Promise<{ notes?: string; remaining: ScoredCandidate[] }> {
    const buildId = build.id
    const targetSize = config.targetSize
    let remaining = [...selected]
    const allNotes: string[] = []
    let round = 0
    const startCount = selected.length
    const initialToTrim = Math.max(0, startCount - targetSize)

    const publishRefinementProgress = async () => {
      const trimmed = Math.max(0, startCount - remaining.length)
      build.result = {
        ...(build.result ?? {}),
        photoIds: build.result?.photoIds ?? [],
        recallSize: build.result?.recallSize ?? 0,
        batchesEvaluated: build.result?.batchesEvaluated ?? 0,
        totalCandidatesEvaluated: build.result?.totalCandidatesEvaluated ?? 0,
        refinementProgress: {
          trimmed,
          toTrim: initialToTrim,
          startCount,
        },
      }
      await build.save()
      this.emitProgress(build)
    }

    // Initial progress publish (0 trimmed yet).
    await publishRefinementProgress()

    // Build a global context summary from config (no per-photo metadata — just portfolio-level info)
    const globalContext = this.buildRefinementGlobalContext(config, selected.length)

    // Debug: save initial grid
    if (DEBUG_SAVE_GRID && remaining.length > 4) {
      try {
        const gridBuffer = await this.generateGridImage(remaining)
        if (gridBuffer) {
          const debugDir = path.join(process.cwd(), 'tmp', 'debug')
          await mkdir(debugDir, { recursive: true })
          const debugPath = path.join(debugDir, `portfolio_grid_${buildId}_${Date.now()}.jpg`)
          await writeFile(debugPath, gridBuffer)
          console.log(`[PortfolioBuild] 🐛 Debug grid saved: ${debugPath}`)
        }
      } catch (debugErr) {
        console.warn(`[PortfolioBuild] ⚠️ Failed to save debug grid:`, (debugErr as Error).message)
      }
    }

    while (remaining.length > targetSize && round < REFINEMENT_MAX_ROUNDS) {
      round++
      const excess = remaining.length - targetSize
      const batches: ScoredCandidate[][] = []
      for (let i = 0; i < remaining.length; i += REFINEMENT_BATCH_SIZE) {
        batches.push(remaining.slice(i, i + REFINEMENT_BATCH_SIZE))
      }

      // Max cuts this round: proportional to excess but at most REFINEMENT_CUT_RATIO per batch
      const maxCutsPerBatch = (batchSize: number) =>
        Math.max(1, Math.ceil(batchSize * REFINEMENT_CUT_RATIO))

      console.log(
        `[PortfolioBuild] ✂️ Refinement round ${round}: ${remaining.length} photos, ` +
          `${batches.length} batches, excess: ${excess}, target: ${targetSize}`
      )

      const roundFlaggedIds: number[] = []
      const previousNotesSummary = allNotes.length > 0 ? allNotes.join('\n---\n') : undefined

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        if (remaining.length - roundFlaggedIds.length <= targetSize) break

        const batch = batches[batchIdx]
        const batchMaxCuts = Math.min(
          maxCutsPerBatch(batch.length),
          remaining.length - roundFlaggedIds.length - targetSize
        )
        if (batchMaxCuts <= 0) break

        // Debug: save refinement batch grid to disk
        if (DEBUG_SAVE_BATCH_GRID) {
          try {
            const gridBuffer = await this.generateGridImage(batch)
            if (gridBuffer) {
              const gridDir = path.join(process.cwd(), 'tmp', 'debug')
              await mkdir(gridDir, { recursive: true })
              const gridPath = path.join(
                gridDir,
                `portfolio_refine_${buildId}_r${round}_b${batchIdx}_${Date.now()}.jpg`
              )
              await writeFile(gridPath, gridBuffer)
              console.log(
                `[PortfolioBuild] 🖼️ Refinement round ${round} batch ${batchIdx + 1} grid saved: ${gridPath} (${Math.round(gridBuffer.length / 1024)}KB)`
              )
            }
          } catch (err) {
            console.warn(
              `[PortfolioBuild] ⚠️ Refinement batch grid failed:`,
              (err as Error).message
            )
          }
        }

        const batchResult = await this.refinementEvaluateBatch(
          batch,
          config,
          trackedModels,
          globalContext,
          previousNotesSummary,
          remaining.length - roundFlaggedIds.length,
          targetSize,
          batchMaxCuts
        )

        if (batchResult.notes) allNotes.push(batchResult.notes)

        // Validate flagged IDs belong to this batch
        const batchIdSet = new Set(batch.map((p) => p.id))
        const validFlagged = batchResult.flaggedIds.filter((id) => batchIdSet.has(id))
        const capped = validFlagged.slice(0, batchMaxCuts)
        roundFlaggedIds.push(...capped)

        console.log(
          `[PortfolioBuild]   📦 Round ${round} batch ${batchIdx + 1}/${batches.length}: ` +
            `${batch.length} photos, flagged ${capped.length}/${batchMaxCuts} max`
        )
      }

      if (roundFlaggedIds.length === 0) {
        console.log(
          `[PortfolioBuild] ⚠️ Round ${round} flagged 0 photos — force-trimming by composite score`
        )
        // Force-trim the weakest by composite score
        remaining.sort((a, b) => b.compositeScore - a.compositeScore)
        remaining = remaining.slice(0, targetSize)
        await publishRefinementProgress()
        break
      }

      const flaggedSet = new Set(roundFlaggedIds)
      const before = remaining.length
      remaining = remaining.filter((p) => !flaggedSet.has(p.id))
      console.log(
        `[PortfolioBuild] ✂️ Round ${round} result: ${before} → ${remaining.length} ` +
          `(removed ${roundFlaggedIds.length})`
      )
      await publishRefinementProgress()
    }

    // Safety trim if still above target after all rounds
    if (remaining.length > targetSize) {
      console.warn(
        `[PortfolioBuild] ⚠️ Still ${remaining.length} after ${round} rounds — force-trimming to ${targetSize}`
      )
      remaining.sort((a, b) => b.compositeScore - a.compositeScore)
      remaining = remaining.slice(0, targetSize)
      await publishRefinementProgress()
    }

    console.log(
      `[PortfolioBuild] ✅ Refinement complete: ${selected.length} → ${remaining.length} in ${round} round(s)`
    )

    return {
      notes: allNotes.length > 0 ? allNotes.join('\n\n') : undefined,
      remaining,
    }
  }

  /**
   * Build a text summary of the portfolio config for global context in refinement batches.
   * This gives the LLM awareness of the overall portfolio goals without sending all photo metadata.
   */
  private buildRefinementGlobalContext(config: PortfolioBuildConfig, currentSize: number): string {
    const parts: string[] = [
      `Portfolio target: ${config.targetSize} photos (currently ${currentSize}).`,
      `Coherence mode: ${config.coherenceMode}.`,
      `Score weights: ${Object.entries(config.weights)
        .filter(([_, w]) => w > 0)
        .map(([k, w]) => `${k}=${w}`)
        .join(', ')}.`,
    ]
    if (config.themePreferences) {
      parts.push(`Theme preferences: "${config.themePreferences}"`)
    }
    if (config.stylePreferences) {
      parts.push(`Style preferences: "${config.stylePreferences}"`)
    }
    if (config.filters?.visualAspects) {
      const vaEntries = Object.entries(config.filters.visualAspects)
        .filter(([_, vals]) => vals && vals.length > 0)
        .map(([k, v]) => `${k}: [${v.join(', ')}]`)
      if (vaEntries.length > 0) {
        parts.push(`Visual aspect filters: ${vaEntries.join('; ')}`)
      }
    }
    if (config.filters?.dateFrom || config.filters?.dateTo) {
      parts.push(
        `Date range: ${config.filters.dateFrom ?? '...'} to ${config.filters.dateTo ?? '...'}`
      )
    }
    return parts.join('\n')
  }

  /**
   * Evaluate a single batch during iterative refinement.
   * Receives images for the batch + global portfolio context + accumulated notes from prior rounds.
   */
  private async refinementEvaluateBatch(
    batch: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService,
    globalContext: string,
    previousNotes: string | undefined,
    currentTotal: number,
    targetSize: number,
    maxCuts: number
  ): Promise<{ notes?: string; flaggedIds: number[] }> {
    const coherenceInstruction = this.getCoherencePromptModifier(config.coherenceMode)

    const systemPrompt = `You are a portfolio curator performing an iterative refinement of a photography portfolio already short-listed.

## Portfolio context
${globalContext}
${coherenceInstruction ? `\n## Coherence mode\n${coherenceInstruction}` : ''}
${previousNotes ? `\n## Notes from previous review rounds\n${previousNotes}` : ''}

## Your task
The portfolio currently has ${currentTotal} photos and must be trimmed to ${targetSize}.
You are reviewing a batch of ${batch.length} photos from this portfolio.
Examine each photo and flag UP TO ${maxCuts} photo(s) that clearly do NOT belong — the weakest, most redundant, or least fitting for this portfolio.

## Rules
- Only flag photos that are clearly inferior or redundant. If all photos in this batch are strong, you may flag fewer or even zero.
- Consider diversity, coherence, and quality relative to the portfolio goals described above.
- Be conservative: it's better to keep a borderline photo than to cut a good one. Other batches will also be reviewed.

Return JSON:
{
  "notes": "<1 short sentence reasoning about the weakest photos BEFORE deciding — what makes them inferior or redundant>",
  "flagged_ids": [<0 to ${maxCuts} photo ids to remove, or empty array>]
}`

    const { userContent } = await this.buildVisionUserContent(
      'refinement',
      `Review batch of ${batch.length} photos (${currentTotal} total in portfolio, target: ${targetSize}):`,
      batch,
      REFINEMENT_MODEL
    )

    const result = await this.callLLMWithRetry(trackedModels, {
      systemPrompt,
      userContent,
      model: REFINEMENT_MODEL,
      temperature: 0.5,
    })

    const notes = result.result?.notes ?? undefined
    const batchIdSet = new Set(batch.map((p) => p.id))
    const flaggedIds: number[] = (result.result?.flagged_ids ?? []).filter(
      (id: any) => typeof id === 'number' && batchIdSet.has(id)
    )

    return { notes, flaggedIds }
  }

  // ── Step 6: Sequencing ─────────────────────────────────────

  private async sequencingPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService
  ): Promise<{ orderedIds: number[]; notes: string }> {
    if (SEQUENCING_MODE === 'computational') {
      return this.computationalSequencingPass(selected, config)
    }

    return this.llmSequencingPass(selected, config, trackedModels)
  }

  private async llmSequencingPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig,
    trackedModels: ModelsService
  ): Promise<{ orderedIds: number[]; notes: string }> {
    const userNotes = config.sequencingPreferences
      ? `Sequencing preferences: "${config.sequencingPreferences}"`
      : ''

    const systemPrompt = `You are a portfolio sequencer. Given a set of selected photos for a photography portfolio, propose an optimal viewing ORDER.
${userNotes ? `\n## User preferences\n${userNotes}` : ''}

Consider:
- **Opening impact:** Start strong to hook the viewer.
- **Flow:** Create visual rhythm — alternate between tight/wide, dark/bright, quiet/energetic.
- **Pacing:** Avoid clustering similar photos. Spread genres and moods.
- **Arc:** Build a narrative or emotional arc if possible.
- **Closing:** End on a memorable note.

Return JSON:
{
  "notes": "<1-2 paragraphs reasoning through your sequencing logic BEFORE committing to an order>",
  "ordered_ids": [<all photo ids in your proposed order>]
}`

    const { userContent } = await this.buildVisionUserContent(
      'sequencing',
      `Sequence these ${selected.length} portfolio photos:`,
      selected,
      REFINEMENT_MODEL
    )

    const result = await this.callLLMWithRetry(trackedModels, {
      systemPrompt,
      userContent,
      model: REFINEMENT_MODEL,
      temperature: 0.5,
    })

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

  private computationalSequencingPass(
    selected: ScoredCandidate[],
    config: PortfolioBuildConfig
  ): { orderedIds: number[]; notes: string } {
    if (selected.length <= 2) {
      return {
        orderedIds: selected.map((photo) => photo.id),
        notes:
          'Computational sequencing kept the original order because the portfolio is too short to optimize heterogeneity meaningfully.',
      }
    }

    const remaining = [...selected].sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore
      return a.id - b.id
    })
    const maxCompositeScore = Math.max(...remaining.map((photo) => photo.compositeScore), 1)
    const orientationTotals = this.countOrientations(selected)
    const orientationPlaced = new Map<PhotoOrientation, number>()
    const ordered: ScoredCandidate[] = []

    const opening = remaining.shift()
    if (!opening) {
      return { orderedIds: [], notes: 'Computational sequencing could not build an order.' }
    }

    ordered.push(opening)
    this.incrementOrientationCount(orientationPlaced, this.getPhotoOrientation(opening))

    while (remaining.length > 0) {
      const slotIndex = ordered.length
      const trailingRun = this.getTrailingOrientationRunLength(ordered)
      const mustBreakVerticalRun =
        trailingRun.orientation === 'vertical' &&
        trailingRun.length >= COMPUTATIONAL_SEQUENCE_MAX_VERTICAL_RUN &&
        remaining.some((photo) => this.getPhotoOrientation(photo) !== 'vertical')
      let bestIndex = 0
      let bestScore = Number.NEGATIVE_INFINITY

      for (let index = 0; index < remaining.length; index++) {
        const candidate = remaining[index]
        if (mustBreakVerticalRun && this.getPhotoOrientation(candidate) === 'vertical') {
          continue
        }

        const embeddingScore = this.getComputationalEmbeddingSequenceScore(candidate, ordered)
        const orientationScore = this.getComputationalOrientationSequenceScore(
          candidate,
          ordered,
          orientationPlaced,
          orientationTotals,
          slotIndex,
          selected.length
        )
        const compositeTieBreaker = Math.max(0, candidate.compositeScore) / maxCompositeScore
        const totalScore =
          embeddingScore * 0.78 + orientationScore * 0.16 + compositeTieBreaker * 0.06

        if (totalScore > bestScore) {
          bestScore = totalScore
          bestIndex = index
        }
      }

      const [chosen] = remaining.splice(bestIndex, 1)
      ordered.push(chosen)
      this.incrementOrientationCount(orientationPlaced, this.getPhotoOrientation(chosen))
    }

    const embeddingsLoaded = selected.filter((photo) => photo._embedding?.length).length
    const orientationSummary = ['horizontal', 'vertical', 'square']
      .map(
        (orientation) =>
          `${orientation}:${orientationTotals.get(orientation as PhotoOrientation) ?? 0}`
      )
      .join(', ')
    const preferenceNote = config.sequencingPreferences
      ? ' User sequencing preferences are not interpreted in computational mode.'
      : ''

    return {
      orderedIds: ordered.map((photo) => photo.id),
      notes:
        `Computational sequencing ordered the portfolio greedily: it keeps the opener strong by starting from the highest composite score, then picks each next photo to maximize embedding dissimilarity against the most recent sequence while softly spreading orientations across the full run instead of hard alternation, with a hard cap of ${COMPUTATIONAL_SEQUENCE_MAX_VERTICAL_RUN} consecutive vertical photos whenever another orientation is available. ` +
        `Embeddings available for ${embeddingsLoaded}/${selected.length} photos; orientation mix ${orientationSummary}.${preferenceNote}`,
    }
  }

  private getComputationalEmbeddingSequenceScore(
    candidate: ScoredCandidate,
    ordered: ScoredCandidate[]
  ): number {
    if (!candidate._embedding?.length) return 0.35

    const recent = ordered
      .slice(-COMPUTATIONAL_SEQUENCE_RECENT_WINDOW)
      .filter((photo) => photo._embedding?.length)

    if (recent.length === 0) return 0.7

    let weightedDissimilarity = 0
    let totalWeight = 0
    let minimumDissimilarity = Number.POSITIVE_INFINITY

    for (let index = 0; index < recent.length; index++) {
      const photo = recent[recent.length - 1 - index]
      if (!photo._embedding) continue

      const similarity = this.cosineSimilarity(candidate._embedding, photo._embedding)
      const dissimilarity = 1 - similarity
      const weight = 1 / (index + 1)
      weightedDissimilarity += dissimilarity * weight
      totalWeight += weight
      minimumDissimilarity = Math.min(minimumDissimilarity, dissimilarity)
    }

    if (totalWeight === 0) return 0.7

    const averageDissimilarity = weightedDissimilarity / totalWeight
    const localSpacing = Number.isFinite(minimumDissimilarity)
      ? minimumDissimilarity
      : averageDissimilarity
    return averageDissimilarity * 0.7 + localSpacing * 0.3
  }

  private getComputationalOrientationSequenceScore(
    candidate: ScoredCandidate,
    ordered: ScoredCandidate[],
    orientationPlaced: Map<PhotoOrientation, number>,
    orientationTotals: Map<PhotoOrientation, number>,
    slotIndex: number,
    totalPhotos: number
  ): number {
    const orientation = this.getPhotoOrientation(candidate)
    if (orientation === 'unknown') return 0

    const totalForOrientation = orientationTotals.get(orientation) ?? 0
    const placedForOrientation = orientationPlaced.get(orientation) ?? 0
    const expectedAfterPick = ((slotIndex + 1) * totalForOrientation) / totalPhotos
    const nextPlacedForOrientation = placedForOrientation + 1
    let score = 1 - Math.min(1, Math.abs(nextPlacedForOrientation - expectedAfterPick))

    const trailingRun = this.getTrailingOrientationRunLength(ordered)
    if (trailingRun.orientation === orientation) {
      if (trailingRun.length >= 2) score -= 0.45
      else if (trailingRun.length === 1) score -= 0.12
    } else if (trailingRun.orientation !== 'unknown' && trailingRun.length >= 3) {
      score += 0.15
    }

    return score
  }

  private getPhotoOrientation(photo: ScoredCandidate): PhotoOrientation {
    const visualAspects = photo.descriptions.visual_aspects ?? {}
    const rawOrientation = visualAspects.orientation
    const orientationValues = Array.isArray(rawOrientation) ? rawOrientation : [rawOrientation]

    for (const value of orientationValues) {
      const normalized = String(value ?? '')
        .trim()
        .toLowerCase()

      if (normalized === 'vertical' || normalized === 'portrait') {
        return 'vertical'
      }

      if (normalized === 'horizontal' || normalized === 'landscape') {
        return 'horizontal'
      }

      if (normalized === 'square') {
        return 'square'
      }
    }

    const rawDimensions = visualAspects.dimensions
    const dimensionValues = Array.isArray(rawDimensions) ? rawDimensions : [rawDimensions]

    for (const value of dimensionValues) {
      const match = String(value ?? '')
        .trim()
        .match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i)

      if (!match) continue

      const width = Number(match[1])
      const height = Number(match[2])
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        continue
      }

      if (height > width) return 'vertical'
      if (width > height) return 'horizontal'
      return 'square'
    }

    return 'unknown'
  }

  private countOrientations(photos: ScoredCandidate[]): Map<PhotoOrientation, number> {
    const counts = new Map<PhotoOrientation, number>()

    for (const photo of photos) {
      this.incrementOrientationCount(counts, this.getPhotoOrientation(photo))
    }

    return counts
  }

  private incrementOrientationCount(
    counts: Map<PhotoOrientation, number>,
    orientation: PhotoOrientation
  ): void {
    counts.set(orientation, (counts.get(orientation) ?? 0) + 1)
  }

  private getTrailingOrientationRunLength(ordered: ScoredCandidate[]): {
    orientation: PhotoOrientation
    length: number
  } {
    if (ordered.length === 0) {
      return { orientation: 'unknown', length: 0 }
    }

    const lastOrientation = this.getPhotoOrientation(ordered[ordered.length - 1])
    if (lastOrientation === 'unknown') {
      return { orientation: lastOrientation, length: 0 }
    }

    let length = 0
    for (let index = ordered.length - 1; index >= 0; index--) {
      if (this.getPhotoOrientation(ordered[index]) !== lastOrientation) break
      length++
    }

    return { orientation: lastOrientation, length }
  }

  // ── Grid image generation ──────────────────────────────────

  private async generateGridImage(photos: ScoredCandidate[]): Promise<Buffer | null> {
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
            if (!photo.thumbnailUrl) return null
            const res = await axios.get(photo.thumbnailUrl, {
              responseType: 'arraybuffer',
            })
            const buffer = Buffer.from(res.data)
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

  // ── LLM call with retry ────────────────────────────────────

  private async callLLMWithRetry(
    trackedModels: ModelsService,
    opts: {
      systemPrompt: string | null
      userContent: any
      model: ModelName
      responseFormat?: any
      temperature?: number
      provider?: LLMProvider
    }
  ): Promise<any> {
    const {
      systemPrompt,
      userContent,
      model,
      responseFormat = { type: 'json_object' },
      temperature = 0.3,
      provider: _provider = 'openai',
    } = opts

    const isGemini = _provider === 'gemini' || String(model).includes('gemini')

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt++) {
      try {
        let result: any

        if (isGemini) {
          const geminiMessages = await this.convertToGeminiFormat(userContent)
          result = await trackedModels.getGeminiResponse(
            systemPrompt ?? '',
            geminiMessages,
            model,
            { temperature },
            false,
            true // throwOnError — we handle retries ourselves
          )
        } else {
          result = await trackedModels.getGPTResponse(
            systemPrompt,
            userContent,
            model,
            responseFormat,
            temperature,
            false
          )
        }

        // Both getGPTResponse and getGeminiResponse can return undefined — treat as failure
        if (!result?.result) {
          throw new Error(`LLM returned empty/undefined response (model: ${model})`)
        }

        return result
      } catch (err: any) {
        lastError = err
        const status = err.response?.status ?? err.status ?? err.httpErrorCode
        // Don't retry on 401/403 (auth) or 422 (validation) — only transient errors
        if (status === 401 || status === 403 || status === 422) throw err

        if (attempt === LLM_MAX_RETRIES) break

        const delay = LLM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        console.warn(
          `[PortfolioBuild] ⚠️ LLM call failed (attempt ${attempt}/${LLM_MAX_RETRIES}, ` +
            `status: ${status ?? 'unknown'}, model: ${model}): ${err.message}. ` +
            `Retrying in ${delay}ms…`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    throw lastError ?? new Error(`LLM call failed after ${LLM_MAX_RETRIES} retries`)
  }

  /**
   * Convert OpenAI-style multimodal content to Gemini format.
   * - `{ type: 'text', text }` → plain string
   * - `{ type: 'image_url', image_url: { url: 'data:mime;base64,...' } }` → `{ inlineData: { mimeType, data } }`
   * - `{ type: 'image_url', image_url: { url: 'https://...' } }` → download from R2 and convert to inlineData
   * - plain string → kept as-is
   */
  private async convertToGeminiFormat(userContent: any): Promise<any[]> {
    // If it's a plain string, wrap it
    if (typeof userContent === 'string') return [userContent]

    // If it's not an array, wrap it
    if (!Array.isArray(userContent))
      return [typeof userContent === 'string' ? userContent : JSON.stringify(userContent)]

    const photoImageService = PhotoImageService.getInstance()
    const parts: any[] = []

    for (const part of userContent) {
      if (typeof part === 'string') {
        parts.push(part)
        continue
      }

      if (part?.inlineData?.mimeType && part?.inlineData?.data) {
        parts.push(part)
        continue
      }

      if (part?.type === 'text') {
        parts.push(part.text)
        continue
      }

      if (part?.type === 'image_url' && part.image_url?.url) {
        const url: string = part.image_url.url

        // Base64 data URI → extract mimeType and data
        if (url.startsWith('data:')) {
          const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/)
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
          }
          continue
        }

        // HTTP(S) URL → download from R2 and convert to base64
        if (url.startsWith('http')) {
          try {
            const filename = url.split('/').pop() ?? ''
            const buffer = await photoImageService.getImageBufferFromR2(filename)
            if (buffer) {
              parts.push({
                inlineData: {
                  mimeType: 'image/png',
                  data: buffer.toString('base64'),
                },
              })
            }
          } catch {
            // Skip images that fail to download
          }
          continue
        }
      }

      // Fallback: stringify unknown parts
      parts.push(JSON.stringify(part))
    }

    return parts
  }

  // ── Helpers ────────────────────────────────────────────────

  private getSimilarityGateThreshold(variant: PromptVariant): number {
    return variant === 'commercial'
      ? COMMERCIAL_SIMILARITY_GATE_THRESHOLD
      : SIMILARITY_GATE_THRESHOLD
  }

  private checkSimilarityGate(
    candidate: ScoredCandidate,
    selected: ScoredCandidate[],
    threshold: number
  ): boolean {
    if (!candidate._embedding || selected.length === 0) return true
    for (const sel of selected) {
      if (!sel._embedding) continue
      const sim = this.cosineSimilarity(candidate._embedding, sel._embedding)
      if (sim > threshold) return false
    }
    return true
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
  }

  /**
   * Build a consistent metadata line for a photo when sending to the LLM.
   * Centralizes the format used across evaluation, refinement, and sequencing phases.
   */
  private async buildVisionUserContent(
    phase: 'evaluation' | 'refinement' | 'sequencing',
    introText: string,
    photos: ScoredCandidate[],
    model: ModelName,
    provider?: LLMProvider
  ): Promise<{ userContent: any[]; unavailableImageIds: number[] }> {
    const userContent: any[] = [{ type: 'text', text: introText }]
    const unavailableImageIds: number[] = []

    for (const photo of photos) {
      userContent.push({ type: 'text', text: this.buildPhotoMetadataLine(photo) })

      const imagePart = await this.buildVisionImagePart(photo.thumbnailUrl, model, provider)
      if (imagePart) {
        userContent.push(imagePart)
      } else {
        unavailableImageIds.push(photo.id)
      }
    }

    if (unavailableImageIds.length > 0) {
      console.warn(
        `[PortfolioBuild] ⚠️ ${phase} prompt omitted ${unavailableImageIds.length}/${photos.length} image(s): ${unavailableImageIds.join(', ')}`
      )
    }

    return { userContent, unavailableImageIds }
  }

  private normalizeBatchDecisions(
    batch: ScoredCandidate[],
    decisions: BatchDecision[],
    unavailableImageIds: number[],
    phase: 'evaluation'
  ): BatchDecision[] {
    const batchIdSet = new Set(batch.map((photo) => photo.id))
    const unavailableIdSet = new Set(unavailableImageIds)
    const normalized: BatchDecision[] = []
    const seenIds = new Set<number>()
    const invalidIds: number[] = []
    const duplicateIds: number[] = []

    for (const decision of decisions) {
      if (typeof decision?.id !== 'number' || !batchIdSet.has(decision.id)) {
        if (typeof decision?.id === 'number') invalidIds.push(decision.id)
        continue
      }

      if (seenIds.has(decision.id)) {
        duplicateIds.push(decision.id)
        continue
      }

      seenIds.add(decision.id)
      const forcedReject = unavailableIdSet.has(decision.id)
      normalized.push({
        id: decision.id,
        analysis:
          typeof decision.analysis === 'string'
            ? decision.analysis
            : forcedReject
              ? 'Image unavailable during vision evaluation.'
              : '',
        select: forcedReject ? false : Boolean(decision.select),
      })
    }

    const missingIds = batch.map((photo) => photo.id).filter((photoId) => !seenIds.has(photoId))

    for (const missingId of missingIds) {
      normalized.push({
        id: missingId,
        analysis: unavailableIdSet.has(missingId)
          ? 'Auto-rejected because the image was unavailable to the LLM.'
          : 'No decision returned by the LLM.',
        select: false,
      })
    }

    if (invalidIds.length > 0 || duplicateIds.length > 0 || missingIds.length > 0) {
      console.warn(
        `[PortfolioBuild] ⚠️ ${phase} decision normalization | invalid_ids:${invalidIds.join(',') || 'none'} | duplicate_ids:${duplicateIds.join(',') || 'none'} | missing_ids:${missingIds.join(',') || 'none'}`
      )
    }

    if (unavailableImageIds.length > 0) {
      console.warn(
        `[PortfolioBuild] ⚠️ ${phase} auto-rejected ${unavailableImageIds.length} text-only candidate(s): ${unavailableImageIds.join(', ')}`
      )
    }

    return normalized
  }

  private async buildVisionImagePart(
    imageUrl: string | undefined,
    model: ModelName,
    provider?: LLMProvider
  ): Promise<any | null> {
    if (!imageUrl) return null

    if (!this.isGeminiModel(model, provider)) {
      return { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
    }

    return this.tryBuildGeminiInlineImagePart(imageUrl)
  }

  private isGeminiModel(model: ModelName, provider?: LLMProvider): boolean {
    return provider === 'gemini' || String(model).includes('gemini')
  }

  private async tryBuildGeminiInlineImagePart(imageUrl: string): Promise<any | null> {
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (!match) return null

      return { inlineData: { mimeType: match[1], data: match[2] } }
    }

    if (!imageUrl.startsWith('http')) return null

    const filename = this.extractFilenameFromImageUrl(imageUrl)
    if (!filename) return null

    try {
      const buffer = await PhotoImageService.getInstance().getImageBufferFromR2(filename)
      return {
        inlineData: {
          mimeType: this.inferImageMimeType(filename),
          data: buffer.toString('base64'),
        },
      }
    } catch {
      return null
    }
  }

  private extractFilenameFromImageUrl(imageUrl: string): string | null {
    try {
      const parsed = new URL(imageUrl)
      const filename = parsed.pathname.split('/').filter(Boolean).pop()
      return filename ? decodeURIComponent(filename) : null
    } catch {
      const filename = imageUrl.split('/').filter(Boolean).pop()
      return filename ? decodeURIComponent(filename) : null
    }
  }

  private inferImageMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()

    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg'
      case '.webp':
        return 'image/webp'
      case '.gif':
        return 'image/gif'
      case '.png':
      default:
        return 'image/png'
    }
  }

  private buildPhotoMetadataLine(photo: ScoredCandidate): string {
    const va = photo.descriptions.visual_aspects

    const parts = [`id:${photo.id}`, photo.originalFileName]

    // if (typeof photo.compositeScore === 'number') {
    //   parts.push(`composite:${photo.compositeScore.toFixed(1)}`)
    // }

    // parts.push(`scores:${scores ? JSON.stringify(scores) : 'N/A'}`)
    parts.push(`genre:${va?.genre ?? 'unknown'}`)
    // parts.push(`lighting:${va?.lighting ?? 'unknown'}`)
    // parts.push(`palette:${va?.palette ?? 'unknown'}`)

    return `[${parts.join(' | ')}]`
  }

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
      const portfolioUrl = `${process.env.APP_URL ?? 'https://app.photoreka.com'}/portfolios/${build.id}`

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

  /**
   * Compute the minimum number of analyzed photos required to build a portfolio
   * of the given size.
   *
   * We must guarantee both:
   * - a sufficiently broad recall pool (`targetSize × RECALL_MULTIPLIER`, capped)
   * - the over-generated evaluation target used before refinement
   *
   * In practice recall usually dominates, but we keep both constraints explicit
   * so eligibility mirrors the actual pipeline requirements.
   */
  public static requiredPoolForTargetSize(targetSize: number): number {
    const normalizedTargetSize = Math.max(
      MIN_PORTFOLIO_TARGET_SIZE,
      Math.min(MAX_TARGET_SIZE, Math.ceil(targetSize))
    )
    const recallTarget = Math.min(normalizedTargetSize * RECALL_MULTIPLIER, RECALL_MAX)
    const overBuffer = Math.max(
      OVER_GENERATE_MIN,
      Math.ceil(normalizedTargetSize * OVER_GENERATE_RATIO)
    )
    const evaluationTarget = normalizedTargetSize + overBuffer

    return Math.max(recallTarget, evaluationTarget)
  }

  public async validateBuildEligibility(
    userId: number,
    targetSize?: number
  ): Promise<{
    eligible: boolean
    reason?: string
    requiredPool?: number
    stats?: { total: number; analyzed: number }
  }> {
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

    // Dynamic requirement based on the target size (falls back to the minimum
    // supported portfolio size when no size is provided).
    const requiredPool =
      typeof targetSize === 'number' && Number.isFinite(targetSize) && targetSize > 0
        ? PortfolioBuildService.requiredPoolForTargetSize(targetSize)
        : PortfolioBuildService.requiredPoolForTargetSize(MIN_PORTFOLIO_TARGET_SIZE)

    if (analyzedResult < requiredPool) {
      const sizeSuffix =
        typeof targetSize === 'number' ? ` to build a portfolio of ${targetSize} photos` : ''
      return {
        eligible: false,
        reason: `You need at least ${requiredPool} analyzed photos${sizeSuffix} so the builder can form a sufficiently broad recall pool. Currently: ${analyzedResult}.`,
        requiredPool,
        stats,
      }
    }

    const ratio = totalResult > 0 ? analyzedResult / totalResult : 0
    if (ratio < MIN_ANALYZED_RATIO) {
      return {
        eligible: false,
        reason: `At least ${Math.round(MIN_ANALYZED_RATIO * 100)}% of your catalog must be analyzed. Currently: ${Math.round(ratio * 100)}% (${analyzedResult}/${totalResult}).`,
        requiredPool,
        stats,
      }
    }

    return { eligible: true, requiredPool, stats }
  }
}
