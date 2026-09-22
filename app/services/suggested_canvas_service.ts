import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import User from '#models/user'
import type {
  SuggestedCanvasProposal,
  SuggestedCanvasState,
  SuggestedCanvasTheme,
} from '#models/user'
import ModelsService from './models_service.js'
import UserCostService from './user_cost_service.js'
import PhotoManager from '../managers/photo_manager.js'
import { CostTracker, createTrackedModelsService } from '../utils/cost_tracker.js'
import { weightedScore } from '../utils/artistic_scores.js'
import { collapseNearDuplicates } from '../utils/near_duplicates.js'
import { getProfileScoreWeights } from '#config/photo_schema'

// ══════════════════════════════════════════════════════════════
// Weekly "moodboard seed" for the dashboard: a themed, varied, profile-ranked
// set of photos with a title, proposed as a starting point for a canvas.
//
// Deliberately cheap: one text-only LLM call to mint themes (reused across
// weeks until exhausted), one CLIP text-embedding call per attempt, and per
// theme a single pgvector query. No vision, no clustering.
// ══════════════════════════════════════════════════════════════

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** How long a proposal stays on offer after it was first shown, unless opened. */
const ON_OFFER_MS = 24 * 60 * 60 * 1000
/** Below this many processed photos we don't even try. */
const MIN_PROCESSED_PHOTOS = 40
/** Themes minted per LLM call. */
const THEME_COUNT = 15
/** Photos in a proposal. */
const TARGET_SIZE = 12
/** A theme that can't fill this many photos is skipped. */
const MIN_PHOTOS = 8
/** Candidates pulled from the CLIP search; the blend below reorders only these. */
const RECALL_LIMIT = TARGET_SIZE * 3
/**
 * Floor on the MEAN raw CLIP similarity of the top TARGET_SIZE photos: does
 * the catalog have this theme at all. Text-image cosines are low by nature
 * (the portfolio builder maps 0.15–0.35 onto 0–1). Measured on a 1.5k street
 * catalog: themes it has score 0.27–0.29 here, themes it lacks ("snowy
 * mountain", "coral reef") 0.20–0.21. A margin over the catalog's median does
 * NOT separate them — an absent theme drags the median down just as far — so
 * the gate is absolute, on the top group, never per photo.
 */
const CLIP_SIM_FLOOR = 0.25
/**
 * Share of the ranking given to the profile quality score; the rest is the
 * photo's CLIP similarity, normalised within the recall pool. CLIP leads so
 * the set stays about the theme, quality breaks close calls.
 */
const QUALITY_WEIGHT = 0.35
/**
 * Image-image cosine gate between selected photos. Looser than the portfolio's
 * 0.8: a theme is homogeneous by definition, we only want to drop the same
 * scene shot twice.
 */
const SIMILARITY_GATE = 0.9
const RELAXED_SIMILARITY_GATE = 0.95
/** Theme mintings per weekly attempt: the first plus one retry. */
const MAX_THEME_GENERATIONS_PER_ATTEMPT = 2
const THEME_MODEL = 'gemini-3.1-flash-lite'
/** Must outlive a whole generation: it runs after the response has been sent. */
const LOCK_TTL_SECONDS = 300

type PatternSummary = { title: string; description: string }

/**
 * What the dashboard asks for on load. `generating` is the answer that earns
 * this its own type: the panel has to know a seed is coming before it exists,
 * or it renders another screen and the seed lands on top of it.
 */
export type SuggestedCanvasStatus =
  | { status: 'none' }
  | { status: 'generating' }
  | { status: 'ready'; proposal: SuggestedCanvasProposal }

type Candidate = {
  id: number
  clipSim: number
  composite: number
  score: number
  embedding: number[] | null
}

const EMPTY_STATE: SuggestedCanvasState = {
  themes: [],
  themeCursor: 0,
  lastAttemptAt: null,
  proposal: null,
}

export default class SuggestedCanvasService {
  private modelsService = new ModelsService()
  private photoManager = new PhotoManager()

  /**
   * Answers in a couple of queries: the proposal still on offer, nothing, or
   * that one is being built. Never waits for a generation — that takes an LLM
   * call and a search per theme, and the dashboard needs its answer now.
   */
  public async getStatus(user: User): Promise<SuggestedCanvasStatus> {
    const state: SuggestedCanvasState = { ...EMPTY_STATE, ...(user.suggestedCanvasState ?? {}) }

    if (state.proposal && this.isOnOffer(state.proposal)) {
      return { status: 'ready', proposal: state.proposal }
    }

    if (state.lastAttemptAt && Date.now() - new Date(state.lastAttemptAt).getTime() < WEEK_MS) {
      return { status: 'none' }
    }

    const patterns = this.collectPatterns(user.catalogPatterns)
    if (patterns.length === 0) return { status: 'none' }

    const processedIds = await this.photoManager.getProcessedPhotoIds(String(user.id))
    if (processedIds.length < MIN_PROCESSED_PHOTOS) return { status: 'none' }

    const lockKey = `suggested_canvas:lock:${user.id}`
    const locked = await redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
    // Someone else is already building this week's seed; the client polls for it.
    if (!locked) return { status: 'generating' }

    void this.runGeneration(user, state, patterns, processedIds, lockKey)
    return { status: 'generating' }
  }

  /** Runs after the response has been sent; the client polls `getStatus` for the result. */
  private async runGeneration(
    user: User,
    state: SuggestedCanvasState,
    patterns: PatternSummary[],
    processedIds: number[],
    lockKey: string
  ): Promise<void> {
    try {
      state.proposal = await this.generate(user, state, patterns, processedIds)
    } catch (error) {
      console.error('[SuggestedCanvas] generation failed:', error)
    } finally {
      // A failed attempt is still an attempt: recording it keeps a broken LLM
      // call from re-triggering generation on every dashboard load.
      state.lastAttemptAt = new Date().toISOString()
      await this.persist(user.id, state).catch((error) =>
        console.error('[SuggestedCanvas] could not persist state:', error)
      )
      await redis.del(lockKey)
    }
  }

  /** Unopened, and either never shown or shown less than a day ago. */
  private isOnOffer(proposal: SuggestedCanvasProposal): boolean {
    if (proposal.openedAt) return false
    if (!proposal.seenAt) return true
    return Date.now() - new Date(proposal.seenAt).getTime() < ON_OFFER_MS
  }

  public async markSeen(user: User): Promise<void> {
    const state = user.suggestedCanvasState
    if (!state?.proposal || state.proposal.seenAt) return
    state.proposal.seenAt = new Date().toISOString()
    await this.persist(user.id, state)
  }

  public async markOpened(user: User): Promise<void> {
    const state = user.suggestedCanvasState
    if (!state?.proposal || state.proposal.openedAt) return
    state.proposal.openedAt = new Date().toISOString()
    await this.persist(user.id, state)
  }

  // ── Generation ─────────────────────────────────────────────

  private async generate(
    user: User,
    state: SuggestedCanvasState,
    patterns: PatternSummary[],
    processedIds: number[]
  ): Promise<SuggestedCanvasProposal | null> {
    const tracker = new CostTracker('other')
    const weights = getProfileScoreWeights(user.profiles)
    const excluded = new Set(state.proposal?.photoIds ?? [])
    let generations = 0

    try {
      while (generations < MAX_THEME_GENERATIONS_PER_ATTEMPT) {
        if (state.themeCursor >= state.themes.length) {
          tracker.setCurrentTask('suggested_canvas_themes')
          const themes = await this.mintThemes(patterns, user.profiles, tracker)
          generations++
          if (themes.length === 0) continue
          state.themes = themes
          state.themeCursor = 0
        }

        const pending = state.themes.slice(state.themeCursor)
        const embeddings = await this.embedThemes(pending)

        for (let i = 0; i < pending.length; i++) {
          state.themeCursor++
          const embedding = embeddings[i]
          if (!embedding) continue

          const photoIds = await this.selectForTheme(
            user.id,
            embedding,
            processedIds,
            weights,
            excluded
          )
          if (photoIds.length < MIN_PHOTOS) {
            console.log(
              `[SuggestedCanvas] ✗ "${pending[i].title}" → ${photoIds.length} photos, skipped`
            )
            continue
          }

          console.log(`[SuggestedCanvas] ✓ "${pending[i].title}" → ${photoIds.length} photos`)
          return {
            title: pending[i].title,
            photoIds,
            createdAt: new Date().toISOString(),
            seenAt: null,
            openedAt: null,
          }
        }
      }
      return null
    } finally {
      UserCostService.recordFromTracker(user.id, tracker).catch(() => {})
    }
  }

  private collectPatterns(catalogPatterns: Record<string, any> | null): PatternSummary[] {
    if (!catalogPatterns) return []
    const out: PatternSummary[] = []
    for (const [key, value] of Object.entries(catalogPatterns)) {
      if (key === 'metadata' || !Array.isArray(value)) continue
      for (const pattern of value) {
        if (typeof pattern?.title !== 'string') continue
        out.push({ title: pattern.title, description: String(pattern.description ?? '') })
      }
    }
    return out
  }

  private async mintThemes(
    patterns: PatternSummary[],
    profile: string | null,
    tracker: CostTracker
  ): Promise<SuggestedCanvasTheme[]> {
    const patternLines = patterns
      .slice(0, 25)
      .map((p) => `- ${p.title}: ${p.description}`)
      .join('\n')

    const systemPrompt = `You propose moodboard themes for a photographer, based on the recurring patterns found in their own photo catalog.

Return JSON: { "themes": [ { "title": string, "query": string } ] } with exactly ${THEME_COUNT} themes.

- "title": a short, evocative moodboard name in English (2-5 words), e.g. "Neon After Dark", "Quiet Kitchens".
- "query": a short English phrase (at most 10 words) naming the ONE dominant visible idea of the theme, written for an image-similarity model, e.g. "neon-lit night street, person on a phone". Concrete and visual: what can be seen, not what it means. One idea, not a list of conditions — a model matching a phrase averages every condition in it, so each extra one blurs the match.
- Each theme must be visually distinct from the others: vary subject, setting, light and mood so the set covers the catalog broadly.
- Prefer themes that plausibly exist in this catalog (they come from its patterns) but also combine or narrow patterns into fresher angles.
- Themes are for a board the photographer will build on, so favour what makes a coherent visual set over what is merely frequent.`

    const userContent = `Photographer profile: ${profile ?? 'general'}

Catalog patterns:
${patternLines}`

    const trackedModels = createTrackedModelsService(this.modelsService, tracker)
    let result: any
    try {
      const resp = await trackedModels.getGeminiResponse(
        systemPrompt,
        [userContent],
        THEME_MODEL,
        { temperature: 0.9, responseMimeType: 'application/json' },
        false,
        true
      )
      result = resp?.result
    } catch (err: any) {
      console.warn(`[SuggestedCanvas] ⚠️ theme minting failed: ${err.message}`)
      return []
    }

    const raw = Array.isArray(result) ? result : result?.themes
    if (!Array.isArray(raw)) return []

    const seen = new Set<string>()
    const themes: SuggestedCanvasTheme[] = []
    for (const item of raw) {
      const title = String(item?.title ?? '').trim()
      const query = String(item?.query ?? '').trim()
      if (!title || !query) continue
      const key = title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      themes.push({ title, query })
    }
    console.log(`[SuggestedCanvas] 🎨 minted ${themes.length} themes`)
    return themes
  }

  private async embedThemes(themes: SuggestedCanvasTheme[]): Promise<(number[] | null)[]> {
    if (themes.length === 0) return []
    const resp = await this.modelsService.getCLIPEmbeddingsCPU(themes.map((t) => t.query))
    const embeddings: any[] = resp?.embeddings ?? []
    return themes.map((_, i) => (Array.isArray(embeddings[i]) ? embeddings[i] : null))
  }

  // ── Selection ──────────────────────────────────────────────

  private async selectForTheme(
    userId: number,
    themeEmbedding: number[],
    processedIds: number[],
    weights: Readonly<Record<string, number>>,
    excluded: Set<number>
  ): Promise<number[]> {
    const literal = `[${themeEmbedding.join(',')}]`
    const result = await db.rawQuery(
      `
        SELECT id,
               dhash,
               descriptions->'artistic_scores' AS artistic_scores,
               embedding::text AS vec,
               1 - (embedding <=> :embedding) AS clip_sim
        FROM photos
        WHERE user_id = :userId
          AND id = ANY(:processedIds)
          AND embedding IS NOT NULL
        ORDER BY embedding <=> :embedding
        LIMIT :limit
      `,
      { embedding: literal, userId, processedIds, limit: RECALL_LIMIT }
    )

    const rows: any[] = result.rows
    if (rows.length < MIN_PHOTOS) return []

    const topSims = rows.slice(0, TARGET_SIZE).map((r) => Number(r.clip_sim))
    const topMean = topSims.reduce((sum, v) => sum + v, 0) / topSims.length
    console.log(
      `[SuggestedCanvas] 🔎 top-${topSims.length} mean CLIP similarity ${topMean.toFixed(3)}`
    )
    if (topMean < CLIP_SIM_FLOOR) return []

    const simMin = Number(rows[rows.length - 1].clip_sim)
    const simMax = Number(rows[0].clip_sim)
    const simRange = Math.max(simMax - simMin, 1e-6)

    const candidates: Candidate[] = []
    const hashById = new Map<number, string>()
    for (const row of rows) {
      const id = Number(row.id)
      if (excluded.has(id)) continue
      const composite = this.compositeScore(row.artistic_scores, weights)
      if (composite === null) continue
      let embedding: number[] | null = null
      try {
        const parsed = JSON.parse(row.vec)
        if (Array.isArray(parsed)) embedding = parsed
      } catch {}
      const clipSim = Number(row.clip_sim)
      const score =
        (1 - QUALITY_WEIGHT) * ((clipSim - simMin) / simRange) + QUALITY_WEIGHT * (composite / 10)
      candidates.push({ id, clipSim, composite, score, embedding })
      if (row.dhash) hashById.set(id, row.dhash)
    }
    if (candidates.length < MIN_PHOTOS) return []

    candidates.sort((a, b) => b.score - a.score)
    const kept = collapseNearDuplicates(
      candidates.map((c) => c.id),
      hashById
    ).ids
    const byId = new Map(candidates.map((c) => [c.id, c]))
    const ordered = kept.map((id) => byId.get(id)!)

    const selected = this.pickDiverse(ordered, SIMILARITY_GATE)
    if (selected.length < TARGET_SIZE) {
      const chosen = new Set(selected.map((c) => c.id))
      const rest = ordered.filter((c) => !chosen.has(c.id))
      selected.push(...this.pickDiverse(rest, RELAXED_SIMILARITY_GATE, selected))
    }
    return selected.slice(0, TARGET_SIZE).map((c) => c.id)
  }

  /** Greedy pass in ranking order: a candidate enters unless it is too close to one already in. */
  private pickDiverse(
    ordered: Candidate[],
    threshold: number,
    already: Candidate[] = []
  ): Candidate[] {
    const selected: Candidate[] = []
    for (const candidate of ordered) {
      if (already.length + selected.length >= TARGET_SIZE) break
      const tooClose =
        candidate.embedding !== null &&
        [...already, ...selected].some(
          (s) =>
            s.embedding !== null &&
            this.cosineSimilarity(candidate.embedding!, s.embedding) > threshold
        )
      if (!tooClose) selected.push(candidate)
    }
    return selected
  }

  private compositeScore(
    scores: Record<string, unknown> | null,
    weights: Readonly<Record<string, number>>
  ): number | null {
    return weightedScore(scores, weights)
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

  private async persist(userId: number, state: SuggestedCanvasState): Promise<void> {
    await User.query()
      .where('id', userId)
      .update({ suggested_canvas_state: JSON.stringify(state) })
  }
}
