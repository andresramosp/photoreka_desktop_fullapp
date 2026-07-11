// @ts-nocheck
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import TagManager from '../managers/tag_manager.js'
import SearchTextService from './search_text_service.js'
import { APP_KNOWLEDGE_SECTIONS, AppKnowledgeSection } from '../utils/app_knowledge_content.js'
import ScoringService from './scoring_service.js'
import StatsService from './stats_service.js'
import SearchPhotoService from './search_photo_service.js'
import VectorService from './vector_service.js'
import { EmbeddingStoreService } from './embeddings_store_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import Collection from '#models/collection'
import Series from '#models/series'
import PortfolioBuild from '#models/portfolio_build'
import db from '@adonisjs/lucid/services/db'
import {
  VISUAL_ASPECTS_SCHEMA,
  ALL_ARTISTIC_SCORE_EXTERNAL_KEYS,
  resolveInternalScoreKeyAnyVariant,
  resolveExternalScoreKeyAnyVariant,
  getPromptVariant,
  getArtisticExternalKeys,
  getArtisticCriteria,
  getAspectValuesForVariant,
  type PromptVariant,
} from '#config/photo_schema'

// ─────────────────────────────────────────────────────────────
// Tool schemas
// ─────────────────────────────────────────────────────────────

export const GetPhotoInfoSchema = z.object({
  photoIds: z
    .array(z.number())
    .describe(
      'One or more numeric photo IDs to retrieve. Pass multiple IDs to batch-fetch in a single call.'
    ),
})

export const AddPhotosToResultSchema = z.object({
  photo_ids: z
    .array(z.number())
    .describe(
      'Ordered array of photo IDs to return to the client. The position in the array defines the display order (index 0 = first). When you want to express a sequence, ranking, or curated order, arrange the IDs accordingly.'
    ),
})

export const ScoreField = z.enum(ALL_ARTISTIC_SCORE_EXTERNAL_KEYS as [string, ...string[]])

/**
 * Translates a model-facing score field name to the internal DB key. The
 * agent tool API accepts external keys from any user profile, so resolution
 * is variant-agnostic (delegated to the central schema).
 */
const toInternalField = (field: string): string => resolveInternalScoreKeyAnyVariant(field)

export const FindPhotosFromPhotoSchema = z.object({
  anchor_photo_ids: z
    .array(z.number())
    .min(1)
    .describe('One or more photo IDs to use as reference (anchor) for the similarity search.'),
  criteria: z
    .enum(['embedding', 'story', 'context', 'chromatic'])
    .describe(
      'Similarity dimension to use:\n' +
        '- embedding: overall visual similarity — matches photos that look globally similar (subject, style, composition combined into a single visual fingerprint). Best default choice for "find similar photos".\n' +
        '- story: narrative similarity — matches photos whose AI-generated story description is semantically similar (same kind of scene, characters, action, mood).\n' +
        '- context: contextual similarity — matches photos taken in similar environments or situations (same type of place, setting, atmosphere).\n' +
        '- chromatic: color palette similarity — matches photos with a similar overall color tone, temperature, and palette distribution.'
    ),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe('Maximum number of similar photos to return (default 10, max 50).'),
  opposite: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, return the most dissimilar photos instead of the most similar.'),
  candidate_ids: z
    .array(z.number())
    .optional()
    .describe(
      'Optional array of photo IDs to restrict the search pool. When provided, similarity is computed only among these photos. Use this to chain with a previous filter_photos or search result.'
    ),
})

export const AppKnowledgeSchema = z.object({
  section: z
    .enum(['terms_and_privacy', 'usage_and_help', 'all'])
    .optional()
    .default('all')
    .describe(
      'Which section to retrieve: terms_and_privacy (legal terms and privacy policy), usage_and_help (general usage guide and FAQ), or all (default — returns both sections).'
    ),
})

export const OverallCatalogViewSchema = z.object({})

export const FetchCollectionsSchema = z.object({
  collectionId: z
    .number()
    .optional()
    .describe(
      'If set, return only this specific collection (by ID) with up to 50 sample photo IDs, instead of every collection with a 15-photo sample each. Use when the user referenced one exact collection (by name or ID).'
    ),
})

export const FetchSeriesSchema = z.object({
  seriesId: z
    .number()
    .optional()
    .describe(
      'If set, return only this specific series (by ID) with up to 50 sample photo IDs, instead of every series with a 15-photo sample each. Use when the user referenced one exact series (by name or ID).'
    ),
})

export const FetchPortfoliosSchema = z.object({
  portfolioId: z
    .number()
    .optional()
    .describe(
      'If set, return only this specific portfolio build (by ID), instead of every recent completed build. Use when the user referenced one exact portfolio (by name or ID).'
    ),
})

/**
 * Builds a Zod object schema for the visualAspects filter from the central
 * photo schema. Each aspect key maps to an optional array of accepted values
 * scoped to the given prompt variant (e.g. genre values differ per variant).
 */
function buildVisualAspectsZodSchema(variant: PromptVariant) {
  return z
    .object(
      Object.fromEntries(
        VISUAL_ASPECTS_SCHEMA.map((aspect) => {
          const values = getAspectValuesForVariant(aspect, variant)
          return [
            aspect.key,
            z
              .array(z.enum(values as [string, ...string[]]))
              .optional()
              .describe(`Filter by ${aspect.label}. Accepted values: ${values.join(', ')}.`),
          ]
        })
      )
    )
    .optional()
    .describe(
      'Filter by visual aspects. Each key maps to an array of accepted values. ' +
        'Multiple keys are ANDed; multiple values within a key are ORed. ' +
        'Do NOT place artistic score names here — use scoreFilters instead.'
    )
}

function buildSearchAdvancedSchema(variant: PromptVariant) {
  const scoreKeys = getArtisticExternalKeys(variant)
  const scoreField = z.enum(scoreKeys as [string, ...string[]])
  return z.object({
    operation: z
      .enum(['intersect', 'union'])
      .describe(
        'How to combine the RANKING sub-searches only (style_query / content_tags / similar_to). ' +
          '`filter` and `scopes` are hard constraints and are NOT affected by this choice. Ignored when ' +
          'fewer than two ranking sub-searches are present (a single one, or a filter-only query, needs no ' +
          'combination — still pass a value, it will simply be a no-op).\n' +
          '- intersect: keep only photos present in ALL ranking sub-searches (AND). Use for "black and white portraits of dogs".\n' +
          '- union: keep photos present in ANY ranking sub-search (OR). Use for "moody photos or anything with dogs".'
      ),
    style_query: z
      .string()
      .optional()
      .describe(
        'Natural language description of the visual style to find. Focus on style, composition, mood, color palette, atmosphere. **MUST ALWAYS BE IN ENGLISH ONLY.** Triggers an embedding-based semantic style search.'
      ),
    content_tags: z
      .array(z.string())
      .min(1)
      .max(3)
      .optional()
      .describe(
        'Between 1 and 3 keywords describing concrete subjects, narrative elements, or specific content (e.g. ["dog", "running"]). **EACH KEYWORD MUST ALWAYS BE IN ENGLISH ONLY.** Triggers a tag-based content search.'
      ),
    filter: z
      .object({
        scoreFilters: z
          .array(
            z.object({
              field: scoreField.describe('Artistic score field to filter on'),
              min: z.number().optional().describe('Minimum score (inclusive), 0–10'),
              max: z.number().optional().describe('Maximum score (inclusive), 0–10'),
            })
          )
          .optional()
          .describe('Filter by numeric artistic scores. Multiple entries are ANDed.'),
        visualAspects: buildVisualAspectsZodSchema(variant),
        filenameLike: z
          .string()
          .optional()
          .describe('Substring match on filename (case-insensitive)'),
        dateFrom: z.string().optional().describe('Photos taken on or after this date (ISO 8601)'),
        dateTo: z.string().optional().describe('Photos taken on or before this date (ISO 8601)'),
      })
      .optional()
      .describe(
        'Structured metadata/attribute filter, applied as a HARD CONSTRAINT (a dynamic candidate-pool boundary) — ' +
          'NOT a ranking source, NOT an ordering, and NOT part of the intersect/union choice. It restricts which photos ' +
          'the ranking sub-searches (style_query/content_tags/similar_to) may return. To order results by a score use ' +
          'the top-level `order_by`, never a filter. When `filter` is the ONLY parameter provided and no `order_by` is ' +
          'given, results are ordered by the first scoreFilter field (best-first), else aesthetic_quality (best-first). ' +
          'Do NOT place artistic score names in visualAspects — those belong in scoreFilters.'
      ),
    order_by: z
      .object({
        fields: z
          .array(scoreField)
          .min(1)
          .max(3)
          .describe(
            'One to three artistic scores to order by. With two or more, photos are ranked by the ' +
              'AVERAGE of those scores — that is how you express a blended criterion like ' +
              '"originality/aesthetics". Do NOT issue several searches that differ only in this field.'
          ),
        direction: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('desc = best first (default), asc = worst first.'),
      })
      .optional()
      .describe(
        'Explicit ordering of the FINAL combined result set by artistic score. Applied last — after scopes, ' +
          'filter and the ranking sub-searches — and it OVERRIDES relevance ordering. Use it whenever the user asks ' +
          'for an order or a superlative ("ordered by humor", "my funniest cold photos", "worst composed portraits"). ' +
          'This is how you rank by a score: never approximate a ranking with a scoreFilter threshold. A photo missing ' +
          'ANY of the requested scores cannot be ranked and goes last, in both directions. Omit it to keep the natural ' +
          'order (relevance when a ranking sub-search ran, otherwise the filter tiered order). Not a selector on its ' +
          'own — pair it with at least one of style_query/content_tags/filter/similar_to.'
      ),
    similar_to: z
      .object({
        anchor_photo_ids: z
          .array(z.number())
          .min(1)
          .describe('Photo IDs to use as similarity anchor.'),
        criteria: z
          .enum(['embedding', 'story', 'context', 'chromatic'])
          .describe(
            'Similarity dimension: embedding (visual), story (narrative), context (environment), chromatic (color palette).'
          ),
        opposite: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, find most dissimilar photos.'),
      })
      .optional()
      .describe('Find photos similar to reference photos. Triggers similarity search.'),
    scopes: z
      .array(
        z
          .object({
            type: z.enum(['collection', 'series', 'portfolio', 'photo_ids']),
            id: z
              .number()
              .optional()
              .describe('Required when type is collection/series/portfolio.'),
            ids: z
              .array(z.number())
              .min(1)
              .optional()
              .describe('Required when type is photo_ids: the explicit photo IDs to restrict to.'),
          })
          .refine((scope) => (scope.type === 'photo_ids' ? (scope.ids?.length ?? 0) > 0 : scope.id !== undefined), {
            message: '`id` is required unless type is "photo_ids", in which case `ids` (non-empty) is required.',
          })
      )
      .min(1)
      .max(3)
      .optional()
      .describe(
        'Restrict every sub-search to only the photos inside specific collection(s)/series/portfolio(s) the user referenced (by ID) — e.g. from a "[Referenced collection/series/portfolio IDs: ...]" line — OR to an explicit, already-known list of photo IDs via type: "photo_ids" (e.g. "de estas fotos que me mostraste, cuáles..." / "from the photos you just showed me" / any photo IDs already surfaced earlier in the conversation, such as INTERNAL_CONTEXT shown_photo_ids). Never invent a collection/series/portfolio id to hold a set of loose photo IDs — use the photo_ids type instead. Pass 2-3 entries when the user named multiple items (their photos are combined with OR before retrieval — e.g. "in my Romania collection or my Alps series"); a single photo_ids entry already covers an arbitrary-size list on its own. This is a hard candidate-pool boundary and does not affect the intersect/union choice. Does not by itself trigger a sub-search — pair it with at least one of style_query/content_tags/filter/similar_to.'
      ),
  })
}

function buildCatalogSampleSchema(variant: PromptVariant) {
  const scoreKeys = getArtisticExternalKeys(variant)
  const genreAspect = VISUAL_ASPECTS_SCHEMA.find((a) => a.key === 'genre')!
  const genreValues = getAspectValuesForVariant(genreAspect, variant)
  return z.object({
    buckets: z
      .number()
      .min(2)
      .max(10)
      .optional()
      .default(5)
      .describe(
        'Number of equal time periods to divide the catalog timeline into (default 5). ' +
          'E.g. 5 buckets over a 5-year catalog = 1 bucket per year.'
      ),
    per_bucket: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(10)
      .describe('Number of photos to sample from each time bucket (default 10).'),
    sort_within: z
      .enum(scoreKeys as [string, ...string[]])
      .optional()
      .describe(
        'If set, pick the top-scoring photos per bucket on this artistic dimension instead of random sampling. ' +
          'E.g. sort_within="aesthetic_quality" returns the best-rated photos per period.'
      ),
    date_from: z
      .string()
      .optional()
      .describe('Restrict sampling to photos taken on or after this date (ISO 8601).'),
    date_to: z
      .string()
      .optional()
      .describe('Restrict sampling to photos taken on or before this date (ISO 8601).'),
    genre: z
      .array(z.string())
      .optional()
      .describe(
        `Filter photos by genre before sampling. **Accepted values MUST ALWAYS BE IN ENGLISH ONLY:** ${genreValues.join(', ')}. ` +
          `E.g. ["${genreValues[0]}"] to sample only ${genreValues[0]} photography evolution.`
      ),
    scan_mode: z
      .enum(['technical', 'semantic'])
      .optional()
      .default('technical')
      .describe(
        'Controls the detail format used when photos are shown for evaluation. ' +
          '`technical`: includes visual aspects (composition, lighting, palette, etc.) for structural analysis. ' +
          '`semantic`: includes content tags grouped by subject category (people, places, objects, etc.) for theme/subject analysis. ' +
          'Choose based on the type of evolution you want to analyze (default: technical).'
      ),
  })
}

export const TagDistributionSchema = z.object({
  tags: z
    .array(z.array(z.string()).min(1).max(4))
    .min(1)
    .max(8)
    .optional()
    .describe(
      'Categories to compare proportions for, as an array of arrays. Each inner array is ONE category: ' +
        'a single tag, e.g. ["car"], or 2+ near-synonyms merged into one combined category, e.g. ' +
        '["motorcycle", "motorbike"], for concepts that might be tagged under more than one name in the ' +
        'catalog. Compares 2 or more categories at once, e.g. [["motorcycle", "motorbike"], ["car"]]. ' +
        '**MUST ALWAYS BE IN ENGLISH ONLY.** Each category is automatically verified against the tags that ' +
        "actually exist in the user's catalog — categories with no match come back in `unresolvedTags` " +
        'instead of being silently shown as 0%. If omitted, returns the most frequent content tags across ' +
        'the whole catalog instead of comparing specific categories.'
    ),
  limit: z
    .number()
    .min(1)
    .max(30)
    .optional()
    .default(15)
    .describe(
      'Max number of distinct tags to return when `tags` is omitted (top most frequent content tags). ' +
        'Ignored when `tags` is provided — all requested (and resolved) tags are returned.'
    ),
})

export const WebSearchSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query in English. Be specific and concise. Used to look up external information on the web.'
    ),
  max_results: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .default(3)
    .describe(
      'Number of web results to return (1–5, default 3). Use 1-2 for quick factual lookups, 3-5 for comparative or broader research.'
    ),
})

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

/**
 * Standard photo data for tools that need meaningful context (get_photo_info,
 * Phase 2 visual context). Includes narrative fields so the model can
 * understand what the photo depicts, plus optional inferred location string
 * from GeocodeCache (resolved through inferredLocationId -> queryNormalized).
 * Omits heavy metadata (scores, visual_aspects, EXIF, notes) — those are
 * injected automatically in Phase 2 via buildPhase2VisualContext with full
 * data + thumbnail images.
 */
/**
 * Renames stored score keys to the external names the agent uses in `order_by`
 * and `scoreFilters` (e.g. `strangeness` → `originality`), so a score it reads
 * is a score it can ask for. Returns null when the photo has no scores.
 */
function externalArtisticScores(scores: any): Record<string, number> | null {
  if (!scores || typeof scores !== 'object') return null
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(scores as Record<string, unknown>)) {
    if (typeof value === 'number') result[resolveExternalScoreKeyAnyVariant(key)] = value
  }
  return Object.keys(result).length > 0 ? result : null
}

export function photoDataForAgentPreview(
  photo: any,
  options: { includeScores?: boolean } = {}
): Record<string, any> {
  const descriptions = photo.descriptions || {}
  const exif = descriptions.EXIF || {}
  const visualAspects = descriptions.visual_aspects || {}
  const inferredLocation = photo.inferredLocation
  const data: Record<string, any> = {
    id: photo.id,
    originalFileName: photo.originalFileName,
    story: descriptions.story || null,
    context: descriptions.context || null,
    genre: visualAspects.genre ?? null,
    dateTaken: exif.dateTaken ?? null,
    inferredLocation: inferredLocation?.queryNormalized ?? null,
  }
  // Phase 2 only: the curator needs the numbers to honour an explicit `order_by` and to
  // ground any score claim. Phase 1 tools omit them — they must not evaluate results.
  if (options.includeScores)
    data.artistic_scores = externalArtisticScores(descriptions.artistic_scores)
  return data
}

/**
 * Minimal photo stub for search-result listings in Phase 1.
 * Only identification + genre — deliberately excludes narrative fields
 * (story, context) to prevent the model from qualitatively evaluating
 * results and over-iterating. Full data + thumbnails are provided
 * exclusively in Phase 2 via buildPhase2VisualContext.
 *
 * ~25 tokens/photo vs ~155 tokens for photoDataForAgent.
 */
export function photoDataForAgentSlim(photo: any): Record<string, any> {
  const visualAspects = (photo.descriptions || {}).visual_aspects || {}
  return {
    id: photo.id,
    originalFileName: photo.originalFileName,
    genre: visualAspects.genre ?? null,
    inferredLocation: photo.inferredLocation?.queryNormalized ?? null,
  }
}

/**
 * Structured photo data for catalog_sample in Phase 2, where no thumbnail is available.
 * Always includes id, originalFileName, dateTaken, and artistic_scores.
 *
 * `technical` mode (~150 tokens/photo): adds visualAspects for structural/compositional analysis.
 * `semantic` mode (~100 tokens/photo): adds content tags grouped by category (misc excluded)
 *   for subject/theme analysis.
 */
export function photoDataForAgentScan(
  photo: any,
  mode: 'technical' | 'semantic' = 'technical'
): Record<string, any> {
  const descriptions = photo.descriptions || {}
  const exif = descriptions.EXIF || {}
  const base: Record<string, any> = {
    id: photo.id,
    originalFileName: photo.originalFileName,
    dateTaken: exif.dateTaken ?? null,
    artistic_scores: descriptions.artistic_scores || null,
  }
  if (mode === 'technical') {
    base.visualAspects = descriptions.visual_aspects || {}
    return base
  }
  // semantic: flat tag list, misc/scores/visual_aspects excluded
  const tags: any[] = photo.tags ?? []
  const tagList: string[] = []
  for (const tagPhoto of tags) {
    const group: string | undefined = tagPhoto.group ?? tagPhoto.tag?.group
    const name: string | undefined = tagPhoto.name ?? tagPhoto.tag?.name
    if (
      !group ||
      group === 'misc' ||
      group === 'artistic_scores' ||
      group === 'visual_aspects' ||
      !name
    )
      continue
    tagList.push(name)
  }
  base.tags = tagList
  return base
}

export function formatCatalogPatternsForAgent(catalogPatterns: any, reviewType: string): string {
  if (!catalogPatterns) {
    return JSON.stringify({
      error: 'No catalog patterns available. The catalog may not have been analyzed yet.',
    })
  }

  const { metadata: _omit, ...patternData } = catalogPatterns

  const stripClusterPhotos = (patterns: any) => {
    if (!Array.isArray(patterns)) return patterns
    return patterns.map(({ clusterPhotos: _omit, ...rest }: any) => {
      // Also strip description and thumbnailUrl from samplePhotos
      if (rest.samplePhotos && Array.isArray(rest.samplePhotos)) {
        rest.samplePhotos = rest.samplePhotos.map(
          ({ description: _omit, thumbnailUrl: _omit2, ...photo }: any) => photo
        )
      }
      return rest
    })
  }

  if (reviewType === 'all') {
    const cleaned = Object.fromEntries(
      Object.entries(patternData).map(([k, v]) => [k, stripClusterPhotos(v)])
    )
    return JSON.stringify(cleaned)
  }

  const requested = patternData[reviewType]
  return JSON.stringify({ reviewType, patterns: stripClusterPhotos(requested) || [] })
}

// ─────────────────────────────────────────────────────────────
// Ranking utilities
// ─────────────────────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion — merges multiple ranked ID lists into a single
 * ranked list that reflects combined relevance across all sources.
 *
 * For each photo ID, its RRF score accumulates across every list it appears in:
 *   score(id) = Σ  1 / (k + rank_i)
 * where rank_i is the 1-based position of the ID in list i.
 * IDs absent from a list contribute 0 for that list.
 * k = 60 is the standard constant that dampens the dominance of top positions
 * while still rewarding high ranks.
 *
 * A photo that ranks highly in multiple sub-searches naturally floats to the top;
 * a photo that only appears in one list gets a modest score proportional to its rank.
 *
 * @param rankedLists  Ordered arrays of photo IDs (best first) from each sub-search.
 * @param k            Smoothing constant (default 60).
 * @returns            Deduplicated IDs sorted by descending RRF score.
 */
function reciprocalRankFusion(rankedLists: number[][], k = 60): number[] {
  const scores = new Map<number, number>()

  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1 // 1-based
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank))
    })
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

// ─────────────────────────────────────────────────────────────
// search_advanced pipeline
//
// One stage per step, in the order the tool runs them:
//   selector check → pools (scopes → filter) → ranking → combine → order → format
// Stages needing `userId` live as closures in createTools; the rest are here.
// ─────────────────────────────────────────────────────────────

/**
 * A bad-input condition the model can act on (unknown scope, no selector).
 * Surfaced verbatim as `{ error }` instead of the generic failure message.
 */
class SearchInputError extends Error {}

/**
 * Result cap for the ranking sources that impose one (`style`, `similar`). A source
 * returning exactly this many IDs is SATURATED: its candidate count is a floor, not a
 * total, and anything ranked below the cap never reached the combine stage.
 */
const RANKING_SOURCE_LIMIT = 250

/** Ranking sources bounded by RANKING_SOURCE_LIMIT. `content` is unbounded. */
const CAPPED_RANKING_SOURCES = new Set(['style', 'similar'])

/**
 * How the returned photos are ordered, and — crucially — WHO decided it.
 *
 * `explicit` is the only kind the user asked for; Phase 2 must honour it. `fallback` is a
 * default the retrieval layer picked because a filter-only query has no ordering signal at
 * all, and Phase 2 stays free to re-curate. A bare `"aesthetic_quality desc"` string could
 * not tell the two apart, which silently froze the curator on ordinary filter queries.
 */
type Ordering =
  | { kind: 'relevance' }
  | { kind: 'explicit'; fields: string[]; direction: 'asc' | 'desc' }
  | { kind: 'fallback'; fields: string[]; direction: 'asc' | 'desc' }

/** Compact `ordering` rendering for the server logs. */
function formatOrdering(ordering: Ordering): string {
  return ordering.kind === 'relevance'
    ? 'relevance'
    : `${ordering.fields.join('+')} ${ordering.direction} (${ordering.kind})`
}

/** Candidate-pool boundaries resolved from `scopes` + `filter`, before any ranking runs. */
interface SearchPools {
  scopeSummary: Array<{ type: string; id?: number; photoIdCount?: number }>
  scopedCandidateIds?: number[]
  hasFilter: boolean
  filterPoolIds?: number[]
  /** Tiered order the filter fell back to; only used when it is the sole selector. */
  filterOrdering?: Ordering
  /** Pool the ranking sub-searches run within: filter → scope → whole catalog. */
  rankingPoolIds?: number[]
  /** A scope resolved to nothing, or the filter matched nothing — no result is possible. */
  isEmpty: boolean
}

/** Outcome of the ranking sub-searches, `labels[i]` describing `idLists[i]`. */
interface RankingOutcome {
  labels: string[]
  idLists: number[][]
}

/**
 * Fuses the ranking sub-searches into one relevance-ordered list. `operation`
 * governs ONLY these sources (a no-op with a single one); the filter constraint
 * was already applied upstream via `rankingPoolIds`.
 *
 * `unionCount` (photos matching ANY source) falls out of the RRF for free. Under
 * `intersect` it is the near-miss signal: a query can return 0 while 52 photos
 * matched something, which is a very different answer from "nothing matched".
 */
function combineRankingResults(
  ranking: RankingOutcome,
  operation: 'intersect' | 'union'
): { ids: number[]; unionCount: number } {
  const rrfRanked = reciprocalRankFusion(ranking.idLists)
  if (operation !== 'intersect') return { ids: rrfRanked, unionCount: rrfRanked.length }
  const sets = ranking.idLists.map((ids) => new Set(ids))
  return {
    ids: rrfRanked.filter((id) => sets.every((s) => s.has(id))),
    unionCount: rrfRanked.length,
  }
}

/**
 * Per-source candidate counts. Reported on EVERY path, including the empty ones — an
 * empty result whose sources each matched dozens of photos is a failed intersection,
 * not an empty catalog, and only these counts let Phase 2 tell them apart.
 */
function buildSourceCandidateCounts(
  pools: SearchPools,
  ranking?: RankingOutcome
): Record<string, number> {
  const counts: Record<string, number> = {}
  ranking?.labels.forEach((label, index) => {
    counts[label] = ranking.idLists[index].length
  })
  if (pools.hasFilter) counts.filter = pools.filterPoolIds?.length ?? 0
  return counts
}

/** Ranking sources that hit their result cap, so their candidate count is a floor. */
function saturatedRankingSources(ranking: RankingOutcome): string[] {
  return ranking.labels.filter(
    (label, index) =>
      CAPPED_RANKING_SOURCES.has(label) && ranking.idLists[index].length >= RANKING_SOURCE_LIMIT
  )
}

/**
 * The value a photo is ranked on: the mean of the requested scores, so several criteria
 * blend ("originality/aesthetics") instead of one merely breaking the other's ties.
 *
 * Returns null unless the photo has EVERY requested score. Averaging over whichever
 * scores happen to exist would let a photo with only `originality: 9` outrank one scoring
 * 9 and 6 — the composite has to compare like with like. A missing score is absent data,
 * not a zero.
 */
function meanScore(
  scores: Record<string, number> | null | undefined,
  internalFields: string[]
): number | null {
  let total = 0
  for (const field of internalFields) {
    const value = scores?.[field]
    if (typeof value !== 'number') return null
    total += value
  }
  return total / internalFields.length
}

/**
 * Orders IDs by the mean of one or more artistic scores. Photos that cannot be ranked
 * (see `meanScore`) go last in BOTH directions. The sort is stable, so ties preserve the
 * incoming order — relevance, or the filter's order — which is the right tiebreak.
 */
function sortIdsByScore(
  ids: number[],
  scoreMap: Map<number, Record<string, number> | null>,
  internalFields: string[],
  direction: 'asc' | 'desc'
): number[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...ids].sort((a, b) => {
    const aScore = meanScore(scoreMap.get(a), internalFields)
    const bScore = meanScore(scoreMap.get(b), internalFields)
    if (aScore === null || bScore === null) {
      if (aScore === bScore) return 0
      return aScore === null ? 1 : -1
    }
    return (aScore - bScore) * sign
  })
}

/**
 * Coverage metadata: the evidence boundary Phase 2 uses to qualify its claims — and,
 * when the result is empty, to explain WHY rather than just reporting nothing.
 * The optional fields are omitted when they carry no information.
 */
function buildQuerySummary(args: {
  operation: string
  pools: SearchPools
  candidateCount: number
  returnedCount: number
  ordering: Ordering | null
  sourceCandidateCounts: Record<string, number>
  /** Photos matching ANY ranking source. Only meaningful with 2+ sources. */
  unionCount?: number
  /** Sources that hit RANKING_SOURCE_LIMIT — their counts are floors, not totals. */
  saturatedSources?: string[]
  /** Returned photos with no value for the `order_by` score (they rank last). */
  unscoredCount?: number
}): Record<string, any> {
  const { operation, pools, candidateCount, returnedCount, ordering, sourceCandidateCounts } = args
  const summary: Record<string, any> = {
    operation,
    scopes: pools.scopeSummary,
    scopePhotoCount: pools.scopedCandidateIds?.length ?? null,
    filterPhotoCount: pools.hasFilter ? (pools.filterPoolIds?.length ?? 0) : null,
    candidateCount,
    returnedCount,
    truncated: candidateCount > returnedCount,
    ordering,
    sourceCandidateCounts,
  }
  if (args.unionCount !== undefined) summary.unionCount = args.unionCount
  if (args.saturatedSources?.length) summary.saturatedSources = args.saturatedSources
  if (args.unscoredCount) summary.unscoredCount = args.unscoredCount
  return summary
}

/**
 * Slim Phase 1 payload per photo, annotated with the 1-based rank it held in each
 * ranking source. Full data + thumbnails arrive later via buildPhase2VisualContext.
 */
async function formatSearchResultPhotos(
  sampledIds: number[],
  ranking: RankingOutcome
): Promise<Record<string, any>[]> {
  const photos = await Photo.query().whereIn('id', sampledIds).preload('inferredLocation')
  const photoMap = new Map(photos.map((p) => [p.id, p]))
  const sourceRanks = ranking.idLists.map((ids) => new Map(ids.map((id, index) => [id, index + 1])))

  return sampledIds.flatMap((id) => {
    const photo = photoMap.get(id)
    if (!photo) return []
    const evidence = Object.fromEntries(
      ranking.labels.flatMap((label, index) => {
        const rank = sourceRanks[index].get(id)
        return rank === undefined ? [] : [[label, { rank }]]
      })
    )
    return [{ ...photoDataForAgentSlim(photo), evidence }]
  })
}

// ─────────────────────────────────────────────────────────────
// Item-level score aggregation (fetch_collections/series/portfolios)
// ─────────────────────────────────────────────────────────────

type PhotoScoreRow = { id: number; artisticScores: Record<string, number> | null }

type ScoreAgg = {
  mean: number
  scoredCount: number
  best: { id: number; value: number }
  worst: { id: number; value: number }
}

/**
 * Aggregates artistic scores across a set of photos into a per-criterion
 * mean/best/worst breakdown, so the agent can compare items (collections,
 * series, portfolios) against each other without fetching each one
 * individually. Criteria with zero scored photos are omitted entirely.
 */
function computeItemScores(
  photos: PhotoScoreRow[],
  variant: PromptVariant
): Record<string, ScoreAgg> {
  const criteria = getArtisticCriteria(variant)
  const result: Record<string, ScoreAgg> = {}

  for (const criterion of criteria) {
    const externalKey = criterion.externalKey ?? criterion.key
    let sum = 0
    let count = 0
    let best: { id: number; value: number } | null = null
    let worst: { id: number; value: number } | null = null

    for (const photo of photos) {
      const raw = photo.artisticScores?.[criterion.key]
      const value = raw !== undefined && raw !== null ? Number(raw) : NaN
      if (!Number.isFinite(value) || value <= 0) continue

      sum += value
      count += 1
      if (!best || value > best.value) best = { id: photo.id, value }
      if (!worst || value < worst.value) worst = { id: photo.id, value }
    }

    if (count === 0 || !best || !worst) continue
    result[externalKey] = {
      mean: Math.round((sum / count) * 10) / 10,
      scoredCount: count,
      best: { id: best.id, value: Math.round(best.value * 10) / 10 },
      worst: { id: worst.id, value: Math.round(worst.value * 10) / 10 },
    }
  }

  return result
}

/**
 * Fetches { id, artistic_scores } for every photo linked to the given
 * collection/series IDs via their pivot table, grouped by group ID.
 * Selects only the artistic_scores sub-object (not the full `descriptions`
 * blob) to keep this cheap even across hundreds of items.
 */
async function fetchPivotPhotoScores(
  pivotTable: 'collection_photos' | 'series_photos',
  pivotFk: 'collection_id' | 'series_id',
  userId: number,
  groupIds: number[]
): Promise<Map<number, PhotoScoreRow[]>> {
  const map = new Map<number, PhotoScoreRow[]>()
  if (groupIds.length === 0) return map

  const rows = await db
    .from(`${pivotTable} as piv`)
    .join('photos as p', 'p.id', 'piv.photo_id')
    .where('p.user_id', userId)
    .whereIn(`piv.${pivotFk}`, groupIds)
    .orderBy('p.id', 'asc')
    .select(
      `piv.${pivotFk} as group_id`,
      'p.id as photo_id',
      db.raw("p.descriptions->'artistic_scores' as artistic_scores")
    )

  for (const row of rows as any[]) {
    const arr = map.get(row.group_id) ?? []
    arr.push({ id: row.photo_id, artisticScores: row.artistic_scores ?? null })
    map.set(row.group_id, arr)
  }
  return map
}

/**
 * Fetches artistic_scores for an arbitrary set of photo IDs (used by
 * fetch_portfolios, whose photo IDs already live on the build's `result`
 * JSON — no pivot join needed).
 */
async function fetchPhotoScoresByIds(
  userId: number,
  photoIds: number[]
): Promise<Map<number, Record<string, number> | null>> {
  const map = new Map<number, Record<string, number> | null>()
  if (photoIds.length === 0) return map

  const rows = await db
    .from('photos')
    .where('user_id', userId)
    .whereIn('id', photoIds)
    .select('id', db.raw("descriptions->'artistic_scores' as artistic_scores"))

  for (const row of rows as any[]) {
    map.set(row.id, row.artistic_scores ?? null)
  }
  return map
}

// ─────────────────────────────────────────────────────────────
// Tool descriptions (centralised)
// ─────────────────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS = {
  get_photo_info:
    '[BASIC_TOOLS] Get detailed info for one or more photos by their IDs. Call this ONLY for: (1) photo IDs attached by the user in the current message (these are auto-prefetched), (2) photo IDs referenced from conversation history that you need to discuss again, (3) sample/photo IDs returned by `fetch_collections`/`fetch_series`/`fetch_portfolios` for a collection/series/portfolio the user specifically referenced (e.g. by name or via a "[Referenced collection/series/portfolio IDs: ...]" line) and wants evaluated or discussed directly. Do NOT call this on photos returned by search_advanced — a later phase automatically injects full descriptions and thumbnails. Pass multiple IDs in a single call to batch-fetch. Returns: story (scene narrative), context, genre, date taken, and optional inferredLocation string (geocode_cache.query_normalized via inferredLocationId) when available. Full visual metadata and thumbnail images are provided automatically in the final evaluation step.',

  fetch_collections:
    "[BASIC_TOOLS] Get the user's collections (manually curated groups of photos), each with their name, description, sample photo IDs, and a `scores` breakdown. Use this when the user asks about their collections or albums — for example 'what collections do I have?', 'which albums exist?'. For series (ordered sequences/stories), use `fetch_series` instead — collections and series are distinct library item types. Pass `collectionId` when the user references ONE specific collection by name or by an exact ID (e.g. a \"[Referenced collection IDs: ...]\" line) — this returns only that item with up to 50 sample photo IDs instead of dumping every collection with a 15-photo sample each. **`scores`:** each collection includes `scores.<criterion>` (e.g. `storytelling`, `aesthetic_quality`, `composition`, `originality`) with `mean` (average across ALL photos in the collection, not just the sample), `scoredCount`, and `best`/`worst` (`{id, value}` of the single strongest/weakest photo on that criterion) — computed over every photo in the collection regardless of `totalPhotos` size. Use this directly to answer cross-collection comparison/ranking questions (e.g. 'which collection has the best composition?', 'rank my collections by storytelling') WITHOUT calling this tool again per collection or running search_advanced per item — this is a single call. Map qualitative asks to the closest criterion (e.g. 'narrative'/'story' → `storytelling`). **Important:** in the no-ID (list-all) mode, `samplePhotoIds` is only populated for the 30 most recently created collections (older ones get `[]`, but their `scores` are always complete) — `totalPhotos` and `scores` are always present for every collection returned. This tool still does NOT provide full photo descriptions or visual thumbnails. Once you identify the collection(s) the user cares about (e.g. via `scores` or by name), call `get_photo_info` with those photo IDs (for direct evaluation/description) or `search_advanced` with a matching `scopes` entry (to filter within it) — see those tools' descriptions. Exception: if the user only wants a high-level overview of their collections (names, counts, structure), no follow-up call is needed.",

  fetch_series:
    "[BASIC_TOOLS] Get the user's series (ordered photo sequences/stories), each with their name, description, sample photo IDs, and a `scores` breakdown. Use this when the user asks about their series, ordered sequences, or photo stories — for example 'show me my series', 'what series have I made?'. For collections (manually curated but unordered groups), use `fetch_collections` instead — collections and series are distinct library item types. Pass `seriesId` when the user references ONE specific series by name or by an exact ID (e.g. a \"[Referenced series IDs: ...]\" line) — this returns only that item with up to 50 sample photo IDs instead of dumping every series with a 15-photo sample each. **`scores`:** each series includes `scores.<criterion>` (e.g. `storytelling`, `aesthetic_quality`, `composition`, `originality`) with `mean` (average across ALL photos in the series, not just the sample), `scoredCount`, and `best`/`worst` (`{id, value}` of the single strongest/weakest photo on that criterion) — computed over every photo in the series regardless of `totalPhotos` size. Use this directly to answer cross-series comparison/ranking questions (e.g. 'which of my series is strongest narratively?', 'rank my series by storytelling') WITHOUT calling this tool again per series or running search_advanced per item — this is a single call. Map qualitative asks to the closest criterion (e.g. 'narrative'/'story' → `storytelling`). **Important:** in the no-ID (list-all) mode, `samplePhotoIds` is only populated for the 30 most recently created series (older ones get `[]`, but their `scores` are always complete) — `totalPhotos` and `scores` are always present for every series returned. This tool still does NOT provide full photo descriptions or visual thumbnails. Once you identify the series the user cares about (e.g. via `scores` or by name), call `get_photo_info` with those photo IDs (for direct evaluation/description) or `search_advanced` with a matching `scopes` entry (to filter within it) — see those tools' descriptions. Exception: if the user only wants a high-level overview of their series (names, counts, structure), no follow-up call is needed.",

  fetch_portfolios:
    "[BASIC_TOOLS] Get the user's portfolio builds (AI-generated curated portfolios produced by the Portfolio Builder tool). Returns only COMPLETED builds, most recent first, each with its id, name, creation date, target size, coherence mode (free/visual/chromatic/narrative/heterogeneous), whether sequencing was enabled, the user's theme and sequencing preferences, the final ordered photo IDs of the portfolio, a `scores` breakdown, and a sample of the builder pool (approved-but-not-selected alternatives). Use this whenever the user asks about their portfolios, generated portfolios, portfolio builds, curated selections, or references an earlier build — for example 'show me my last portfolio', 'what portfolios have I built?', 'open the street portfolio I made'. Pass `portfolioId` when the user references ONE specific portfolio by name or by an exact ID (e.g. a \"[Referenced portfolio IDs: ...]\" line) — this returns only that build (with a larger builder-pool sample) instead of every recent build. **`scores`:** each build includes `scores.<criterion>` (e.g. `storytelling`, `aesthetic_quality`, `composition`, `originality`) with `mean` (average across all photos in the final `photoIds`), `scoredCount`, and `best`/`worst` (`{id, value}`). Use this directly to answer cross-portfolio comparison/ranking questions in a single call — map qualitative asks to the closest criterion (e.g. 'narrative'/'story' → `storytelling`). **Important:** this tool still does NOT provide full photo descriptions or visual thumbnails. Once you identify the portfolio(s) the user cares about, call `get_photo_info` on a subset of the relevant photo IDs (for direct evaluation/description) or `search_advanced` with a matching `scopes` entry (to filter within it). Exception: if the user only wants a high-level overview of their portfolios (names, counts, config), no follow-up call is needed.",

  search_advanced:
    '[PHOTO_SEARCH] **The primary search tool.** Combine ranking strategies and hard constraints in a single call. RANKING sources (relevance-ordered): (1) style_query — semantic style/mood search, (2) content_tags — subject/content keyword search, (3) similar_to — similarity to reference photos. These are fused by relevance and combined via `operation` (intersect = AND, union = OR); `operation` is a no-op with fewer than two ranking sources. HARD CONSTRAINTS (candidate-pool boundaries — NOT ranking, NOT part of intersect/union): (4) filter — metadata/score/visual-aspect/date filtering, and (5) scopes — restrict to specific collection(s)/series/portfolio(s) the user referenced by ID, OR to an explicit list of already-known photo IDs via `scopes([{type:"photo_ids", ids:[...]}])` (e.g. "from these photos", "of the ones you just showed me", any IDs already surfaced earlier in the conversation — NEVER invent a collection/series/portfolio id to hold loose photo IDs, use photo_ids instead). Constraints only narrow which photos the ranking sources may return; they never contribute relevance. ORDERING: (6) order_by — orders the final combined set by the average of 1-3 artistic scores and OVERRIDES relevance. Use it for every "ordered by X" / "my best/worst X" request; never fake a ranking with a scoreFilter threshold, and never issue two searches that differ only in the score they sort by — pass both scores to one order_by instead. **A `filter`-only (or scope+filter) call is valid:** with no ranking source and no order_by, results fall back to the filter\'s tiered order (first scoreFilter field best-first, else aesthetic_quality best-first). The effective order is always reported in querySummary.ordering as `{kind, field, direction}` — `explicit` when it came from order_by, `relevance` from the ranking fusion, `fallback` when the search picked a default nobody asked for. **ALL parameters MUST ALWAYS BE SPECIFIED IN ENGLISH ONLY.** Only the final result is sampled and returned with photo ID, filename, genre, optional inferredLocation string (query_normalized), source evidence (per ranking source), and coverage metadata (candidateCount, truncated, ordering, per-source counts, plus unionCount / saturatedSources / unscoredCount when they apply). An EMPTY result still reports its per-source counts and unionCount, so a failed intersection can be told apart from an empty catalog — read them instead of retrying blindly. Full metadata, descriptions, and thumbnail images are provided automatically in the final evaluation step — do NOT call get_photo_info on these results. Examples: "black and white street photos with dogs" → filter(palette=b&w, genre=street) + content_tags(["dog"]) (filter constrains, content ranks). "moody photos or anything with dogs" → style_query("dark moody") + content_tags(["dog"]) with union (two ranking sources OR-combined). "my best-composed vertical photos" → filter(orientation=vertical) + order_by(fields=["composition"], direction=desc). "moody vertical photos" → style_query("dark moody") + filter(orientation=vertical) (filter constrains, style ranks). "the funniest of my cold-toned photos" → filter(temperature=cold) + order_by(fields=["humor"], direction=desc) (order_by ranks, filter constrains). "chromatically similar to photo 4657, street only, ranked by originality/aesthetics" → similar_to(anchor=[4657], criteria=chromatic) + filter(genre=street) + order_by(fields=["originality","aesthetic_quality"], direction=desc) — ONE call, both scores averaged. "vertical photos in my Romania 2025 collection" → filter(orientation=vertical) + scopes([{type:"collection", id:155}]). "photo of the girl in the snow, in my Romania collection or my Alps series" → content_tags(["girl","snow"]) + scopes([{type:"collection", id:155}, {type:"series", id:88}]). "of these photos you just showed me, which have humor above 5" (referring to specific IDs already surfaced earlier in the conversation, e.g. INTERNAL_CONTEXT shown_photo_ids=[12,34,56]) → filter(scoreFilters=[{field:"humor", min:5.1}]) + scopes([{type:"photo_ids", ids:[12,34,56]}]) — ONE call, no need for get_photo_info first.',

  catalog_sample:
    '[CATALOG_INSIGHT] **Temporal catalog sampling for broad exploration.** Divides the catalog timeline into equal time buckets and samples representative photos from each period. Returns structured data: an array of buckets, each with its date range and sampled photos (id, filename, genre, and optional inferredLocation string/query_normalized). Use this for evolution questions, progress over time, or getting a representative cross-section of the catalog. Always pair with `overall_catalog_view` in parallel for holistic context. NEVER use this for targeted searches — use `search_advanced` instead. Optional filters: **genre values MUST ALWAYS BE IN ENGLISH ONLY** (e.g. ["street"] for street photography evolution), date_from/date_to, sort_within (pick best-scored photos per period instead of random), scan_mode (technical for compositional/visual analysis, semantic for subject/theme analysis). Examples: "How has my photography evolved?" → catalog_sample(buckets=6, scan_mode=technical) + overall_catalog_view in parallel. "What subjects appear most in my street work?" → catalog_sample(buckets=5, genre=["street"], scan_mode=semantic) + overall_catalog_view in parallel.',

  overall_catalog_view:
    '[CATALOG_INSIGHT] Get a single combined report of the entire catalog: catalog patterns (recurring themes, subjects, narrative motifs), visual aspects distribution, and artistic scores statistics. Use this as the FIRST tool whenever the user asks for advice on improving their photography, critique of their catalog, identification of weak points or strengths, general feedback on their style, or any holistic question about their photographic practice. This tool replaces calling get_catalog_patterns + stats_visual_aspects + stats_artistic_scores individually — it returns all of that data in one shot.',

  app_knowledge:
    "[BASIC_TOOLS] Get useful information about the Photoreka application itself. Use this whenever the user asks about how the app works, what features are available, how to use a specific feature, pricing, data limits, privacy policy, terms of use, data handling, account management, or any general help question unrelated to their photo catalog. Returns one or both sections: 'terms_and_privacy' (legal terms and privacy policy) and 'usage_and_help' (feature overview, FAQ, tips).",

  web_search:
    '[EXTERNAL_INFO] Search the internet for factual, current, or external information not present in the photo catalog. Use ONLY for: photography techniques and tutorials, camera/lens gear specs and reviews, photographer biographies and references, photographic movements and history, software tools, or any external context the user explicitly asks about. Do NOT use for questions that can be answered from the catalog or app knowledge. Use max_results=1-2 for simple factual lookups (e.g. "what is the hyperfocal distance formula"), 3-5 for comparative or research questions. **Sequencing:** call this tool FIRST whenever the results of this search are needed to determine the parameters of a subsequent tool call. Only call it in parallel with other tools when those tools\u2019 parameters are already fully defined without the web results.',

  tag_distribution:
    '[CATALOG_INSIGHT] Get the proportional distribution (counts + percentages) of specific CONTENT tags across the catalog \u2014 concrete subjects, people, animals, objects, or place names (e.g. "dogs" vs "cats", "men" vs "women", or 3+ way comparisons like "cars" vs "motorcycles" vs "bicycles"). `tags` is an array of arrays \u2014 each inner array is ONE category, either a single term or 2+ near-synonyms merged into one combined category (e.g. ["motorcycle", "motorbike"]) for concepts that could plausibly be tagged under more than one name; the merge is done server-side with proper deduplication, so photos tagged with more than one synonym are never double-counted. Use this ONLY for content/subject "what predominates" or "what proportion" questions. Do NOT use it for genre, photographic style, lighting, palette, composition, or mood questions (e.g. "portraits vs landscapes", "which style predominates") \u2014 those are visual_aspects and are answered far better by `overall_catalog_view`\'s visual_aspects_stats. Each returned tag includes both `percentage` (share of the ENTIRE catalog) and `relativePercentage` (share AMONG the compared/returned tags only) \u2014 **use `relativePercentage` when answering "what predominates" / "X vs Y" questions** (e.g. "55% hombres, 45% mujeres"), since `percentage` alone does not reflect the proportion between the compared terms. Each requested tag is automatically checked against the tags that actually exist in the user\'s catalog (loose, whole-word matching) \u2014 terms with no real match are returned in `unresolvedTags` rather than silently shown as 0%; treat those as "no data for this term", NOT as "confirmed zero photos". **Always call in parallel with `overall_catalog_view`** to give complementary context (content proportion + overall catalog profile), unless the question is narrowly about counting concrete tags with no stylistic dimension at all. Pass `tags` (English keywords, 2 or more) to compare specific terms; omit `tags` to get the most frequent content tags overall (top `limit`).',
} as const

// ─────────────────────────────────────────────────────────────
// AgentToolsService — owns tool definitions and their logic
// ─────────────────────────────────────────────────────────────

export default class AgentToolsService {
  constructor(
    private photoManager: PhotoManager,
    private searchService: SearchTextService
  ) {}

  /**
   * Creates all agent tools bound to a specific user session.
   * @param userId       The authenticated user's ID
   * @param foundPhotoIds Mutable array that accumulates photo IDs surfaced to the client
   */
  createTools(
    userId: number,
    variant: PromptVariant,
    foundPhotoIds: number[],
    provider: 'openai' | 'gemini' | 'deepseek' | 'xai' | 'qwen' = 'openai'
  ) {
    const { photoManager, searchService } = this

    // ── Tool 1: get_photo_info ──────────────────────────────
    // Returns story + context + genre + dateTaken + optional inferredLocation
    // string (queryNormalized) for attached/referenced photos.
    // Full metadata and thumbnail images are injected in Phase 2 by
    // buildPhase2VisualContext — no need to include them here.
    const getPhotoInfo = tool(
      async ({ photoIds: ids }): Promise<string> => {
        const photos = await Photo.query()
          .whereIn('id', ids)
          .where('user_id', userId)
          .preload('inferredLocation')
        const photoMap = new Map(photos.map((p) => [p.id, p]))

        const results = ids.map((photoId: number) => {
          const photo = photoMap.get(photoId)
          if (!photo) return { photoId, error: `Photo ${photoId} not found` }
          return photoDataForAgentPreview(photo)
        })

        return JSON.stringify(results)
      },
      {
        name: 'get_photo_info',
        description: TOOL_DESCRIPTIONS.get_photo_info,
        schema: GetPhotoInfoSchema,
      }
    )

    // ─────────────────────────────────────────────────────────
    // Internal ID-only search functions (no sampling, return all matching IDs)
    // Used by search_advanced to get full result sets before intersect/union.
    // ─────────────────────────────────────────────────────────

    /** Semantic style search → direct CLIP vector search, returns IDs ordered by cosine similarity. */
    const _getIdsByStyle = async (
      query: string,
      candidatePoolIds?: number[]
    ): Promise<number[]> => {
      const [embedding] = await EmbeddingStoreService.getCLIPEmbeddings([query])
      if (!embedding) return []

      const allPhotoIds =
        candidatePoolIds ?? (await photoManager.getPhotosIdsForSearch(userId.toString()))
      const vectorService = new VectorService()
      const results = await vectorService.findSimilarPhotoToEmbedding(
        embedding,
        0.15,
        RANKING_SOURCE_LIMIT,
        'cosine_similarity',
        allPhotoIds
      )
      return results.map((r: any) => r.id as number)
    }

    /** Content/tag search → returns all matching photo IDs (no limit). */
    const _getIdsByContent = async (
      tags: string[],
      candidatePoolIds?: number[]
    ): Promise<number[]> => {
      const scoringService = new ScoringService()
      const allPhotoIds =
        candidatePoolIds ?? (await photoManager.getPhotosIdsForSearch(userId.toString()))
      const scored = await scoringService.getScoredPhotosByTags(
        allPhotoIds,
        tags,
        [],
        'adaptive',
        userId.toString()
      )
      if (!scored || scored.length === 0) return []
      return scored.map((s) => s.id)
    }

    /** Metadata/attribute filter → returns all matching photo IDs (no limit). */
    const _getIdsByFilter = async (
      args: {
        scoreFilters?: { field: string; min?: number; max?: number }[]
        visualAspects?: Record<string, string[]>
        filenameLike?: string
        dateFrom?: string
        dateTo?: string
      },
      candidatePoolIds?: number[]
    ): Promise<{ ids: number[]; ordering: Ordering }> => {
      const { scoreFilters, visualAspects, filenameLike, dateFrom, dateTo } = args
      const query = Photo.query()
        .where('user_id', userId)
        .select('id', 'original_file_name', 'descriptions', 'created_at')
        .orderBy('created_at', 'desc')
      if (candidatePoolIds) query.whereIn('id', candidatePoolIds)
      const photos = await query

      const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : null
      const dateToMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null

      let filtered = photos.filter((photo) => {
        const scores = (photo.descriptions?.artistic_scores ?? {}) as Record<string, number>
        const aspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, string[]>

        if (scoreFilters && scoreFilters.length > 0) {
          for (const sf of scoreFilters) {
            const internalField = toInternalField(sf.field)
            const val = scores[internalField]
            if (val === undefined) return false
            if (sf.min !== undefined && val < sf.min) return false
            if (sf.max !== undefined && val > sf.max) return false
          }
        }

        if (visualAspects) {
          for (const [key, accepted] of Object.entries(visualAspects)) {
            if (!accepted || accepted.length === 0) continue
            const photoValues: string[] = aspects[key] ?? []
            const matches = accepted.some((v) =>
              photoValues.some((pv) => pv.toLowerCase() === v.toLowerCase())
            )
            if (!matches) return false
          }
        }

        if (filenameLike) {
          if (!photo.originalFileName.toLowerCase().includes(filenameLike.toLowerCase()))
            return false
        }

        const exifData = (photo.descriptions?.EXIF ?? {}) as Record<string, any>
        const dateTakenRaw = exifData.dateTaken as string | undefined
        const createdMs = dateTakenRaw
          ? new Date(dateTakenRaw).getTime()
          : new Date(photo.createdAt.toString()).getTime()
        if (dateFromMs !== null && createdMs < dateFromMs) return false
        if (dateToMs !== null && createdMs > dateToMs) return false

        return true
      })

      // Tiered fallback ordering — only surfaces when `filter` is the sole selector AND no
      // top-level `order_by` was given. Whenever a ranking source runs, or `order_by` is
      // present, this order is overwritten downstream. It is reported as `kind: 'fallback'`
      // so Phase 2 knows the user never asked for it.
      //   tier 1: first scoreFilter field (best-first)
      //   tier 2: default quality score (aesthetic_quality, best-first)
      const orderExternal =
        scoreFilters && scoreFilters.length > 0 ? scoreFilters[0].field : 'aesthetic_quality'
      const internalOrderField = toInternalField(orderExternal)
      filtered.sort((a, b) => {
        const aScore =
          ((a.descriptions?.artistic_scores as Record<string, number>) ?? {})[internalOrderField] ??
          -1
        const bScore =
          ((b.descriptions?.artistic_scores as Record<string, number>) ?? {})[internalOrderField] ??
          -1
        return bScore - aScore
      })

      return {
        ids: filtered.map((p) => p.id),
        ordering: { kind: 'fallback', fields: [orderExternal], direction: 'desc' },
      }
    }

    /** Similarity search → returns all matching photo IDs (no limit). */
    const _getIdsBySimilarity = async (
      args: {
        anchor_photo_ids: number[]
        criteria: string
        opposite?: boolean
      },
      candidatePoolIds?: number[]
    ): Promise<number[]> => {
      const searchPhotoService = new SearchPhotoService()
      const results = await searchPhotoService.searchByPhotos(
        {
          anchorIds: args.anchor_photo_ids,
          currentPhotosIds: args.anchor_photo_ids,
          criteria: args.criteria,
          tagIds: [],
          boxesIds: [],
          descriptionCategories: [],
          opposite: args.opposite ?? false,
          inverted: false,
          resultLength: RANKING_SOURCE_LIMIT,
          candidatePoolIds,
        },
        userId
      )
      return results.map((p: any) => p.id as number)
    }

    /**
     * Resolves a { type, id } scope reference into the set of photo IDs it contains,
     * scoped to this user. Returns null when the referenced item doesn't exist (or
     * belongs to someone else), so callers can surface a clear error instead of
     * silently behaving like an empty scope.
     */
    const _resolveScopePhotoIds = async (scope: {
      type: 'collection' | 'series' | 'portfolio' | 'photo_ids'
      id?: number
      ids?: number[]
    }): Promise<number[] | null> => {
      if (scope.type === 'photo_ids') {
        // Not a named-resource lookup — silently drop IDs that don't belong to this
        // user rather than erroring, same as a resolved collection with 0 photos.
        const photos = await Photo.query()
          .whereIn('id', scope.ids ?? [])
          .where('user_id', userId)
          .select('id')
        return photos.map((p) => p.id)
      }
      if (scope.id === undefined) return null // malformed input guard; also narrows the type below
      if (scope.type === 'collection') {
        const collection = await Collection.query()
          .where('id', scope.id)
          .where('user_id', userId)
          .preload('photos', (q) => q.select('id'))
          .first()
        if (!collection) return null
        return collection.photos.map((p) => p.id)
      }
      if (scope.type === 'series') {
        const series = await Series.query()
          .where('id', scope.id)
          .where('user_id', userId)
          .preload('photos', (q) => q.select('id'))
          .first()
        if (!series) return null
        return series.photos.map((p) => p.id)
      }
      const build = await PortfolioBuild.query()
        .where('id', scope.id)
        .where('user_id', userId)
        .first()
      if (!build) return null
      const photoIds = build.result?.photoIds
      return Array.isArray(photoIds) ? photoIds : []
    }

    // ── search_advanced stages ──────────────────────────────

    /** Stage 1 — a search needs something to search on. `order_by` alone is not a selector. */
    const _assertHasSelector = (args: {
      style_query?: string
      content_tags?: string[]
      filter?: unknown
      similar_to?: unknown
    }): void => {
      const hasSelector =
        Boolean(args.filter) ||
        Boolean(args.style_query) ||
        (args.content_tags?.length ?? 0) > 0 ||
        Boolean(args.similar_to)
      if (!hasSelector) {
        throw new SearchInputError(
          'No search criteria specified. Provide at least one of: style_query, content_tags, filter, similar_to.'
        )
      }
    }

    /**
     * Stage 2 — resolve the HARD CONSTRAINTS, each narrowing the pool for the next:
     * scopes → filter. Neither is a ranking source; neither enters RRF.
     */
    const _resolveSearchPools = async (
      scopes:
        | Array<{ type: 'collection' | 'series' | 'portfolio' | 'photo_ids'; id?: number; ids?: number[] }>
        | undefined,
      filter: Parameters<typeof _getIdsByFilter>[0] | undefined
    ): Promise<SearchPools> => {
      let scopedCandidateIds: number[] | undefined
      if (scopes && scopes.length > 0) {
        const scopeSet = new Set<number>()
        for (const scope of scopes) {
          const scopeIds = await _resolveScopePhotoIds(scope)
          if (scopeIds === null) {
            throw new SearchInputError(`Scope ${scope.type} ${scope.id} not found.`)
          }
          for (const id of scopeIds) scopeSet.add(id)
        }
        scopedCandidateIds = [...scopeSet]
        console.log(
          `[Agent]   🔎 search_advanced pre-scoped to [${scopes.map((scope) => (scope.type === 'photo_ids' ? `photo_ids:[${(scope.ids ?? []).length} ids]` : `${scope.type}:${scope.id}`)).join(', ')}]: ${scopedCandidateIds.length} candidate IDs`
        )
      }

      let filterPoolIds: number[] | undefined
      let filterOrdering: Ordering | undefined
      if (filter) {
        const filterResult = await _getIdsByFilter(filter, scopedCandidateIds)
        filterPoolIds = filterResult.ids
        filterOrdering = filterResult.ordering
        console.log(
          `[Agent]   🔎 search_advanced filter constraint: ${filterPoolIds.length} IDs (order: ${formatOrdering(filterOrdering)})`
        )
      }

      return {
        scopeSummary: (scopes ?? []).map((scope) =>
          scope.type === 'photo_ids'
            ? { type: scope.type, photoIdCount: (scope.ids ?? []).length }
            : { type: scope.type, id: scope.id }
        ),
        scopedCandidateIds,
        hasFilter: Boolean(filter),
        filterPoolIds,
        filterOrdering,
        rankingPoolIds: filter ? filterPoolIds : scopedCandidateIds,
        isEmpty:
          (scopes !== undefined && scopes.length > 0 && scopedCandidateIds!.length === 0) ||
          (Boolean(filter) && filterPoolIds!.length === 0),
      }
    }

    /** Stage 3 — dispatch the ranking sub-searches in parallel, within the candidate pool. */
    const _runRankingSearches = async (
      args: {
        style_query?: string
        content_tags?: string[]
        similar_to?: Parameters<typeof _getIdsBySimilarity>[0]
      },
      rankingPoolIds?: number[]
    ): Promise<RankingOutcome> => {
      const labels: string[] = []
      const searches: Promise<number[]>[] = []
      if (args.style_query) {
        labels.push('style')
        searches.push(_getIdsByStyle(args.style_query, rankingPoolIds))
      }
      if (args.content_tags && args.content_tags.length > 0) {
        labels.push('content')
        searches.push(_getIdsByContent(args.content_tags, rankingPoolIds))
      }
      if (args.similar_to) {
        labels.push('similar')
        searches.push(_getIdsBySimilarity(args.similar_to, rankingPoolIds))
      }
      return { labels, idLists: await Promise.all(searches) }
    }

    /**
     * Stage 5 — explicit ordering, applied to the full combined set BEFORE sampling, so the
     * returned page really is the top-N on that score rather than the top-N by relevance
     * re-sorted. Overrides both relevance and the filter's tiered order.
     */
    const _applyExplicitOrder = async (
      combinedIds: number[],
      order_by: { fields: string[]; direction?: 'asc' | 'desc' }
    ): Promise<{ ids: number[]; ordering: Ordering; unscoredIds: Set<number> }> => {
      // `direction` has a zod default, but not every provider echoes defaults back.
      const direction = order_by.direction === 'asc' ? 'asc' : 'desc'
      const internalFields = order_by.fields.map(toInternalField)
      const scoreMap = await fetchPhotoScoresByIds(userId, combinedIds)
      const ids = sortIdsByScore(combinedIds, scoreMap, internalFields, direction)
      const unscoredIds = new Set(
        combinedIds.filter((id) => meanScore(scoreMap.get(id), internalFields) === null)
      )
      const ordering: Ordering = { kind: 'explicit', fields: order_by.fields, direction }
      console.log(
        `[Agent]   🔎 search_advanced explicit order_by: ${ids.length} IDs (order: ${formatOrdering(ordering)})` +
          (unscoredIds.size > 0 ? ` | ${unscoredIds.size} unscored → last` : '')
      )
      return { ids, ordering, unscoredIds }
    }

    // (catalog_sample is now a standalone tool — see below)

    // ── Tool: search_advanced ───────────────────────────────
    const searchAdvanced = tool(
      async ({
        operation,
        style_query,
        content_tags,
        filter,
        similar_to,
        scopes,
        order_by,
      }): Promise<string> => {
        // Limit is intentionally not exposed to the model — Phase 1 always returns
        // the maximum so Phase 2 (the curator) can make the final selection.
        // Keep in sync with PHASE2_TOTAL_IMAGE_LIMIT in langchain_agent_service.ts.
        const limit = 20
        try {
          // ── 1. Selector check ──
          _assertHasSelector({ style_query, content_tags, filter, similar_to })

          // ── 2. Hard constraints → candidate pools ──
          const pools = await _resolveSearchPools(scopes, filter)

          // An empty result still carries its full coverage story: which sources matched what,
          // and how close an `intersect` came. "Nothing matched" and "nothing matched BOTH" are
          // different answers, and only the counts distinguish them.
          const emptyResult = (ranking?: RankingOutcome, unionCount?: number) =>
            JSON.stringify({
              querySummary: buildQuerySummary({
                operation,
                pools,
                candidateCount: 0,
                returnedCount: 0,
                ordering: null,
                sourceCandidateCounts: buildSourceCandidateCounts(pools, ranking),
                unionCount,
                saturatedSources: ranking ? saturatedRankingSources(ranking) : undefined,
              }),
              photos: [],
            })

          // Scope resolved to nothing, or the filter matched nothing → no ranking source can help.
          if (pools.isEmpty) return emptyResult()

          // ── 3. Ranking sub-searches, within the pool ──
          const ranking = await _runRankingSearches(
            { style_query, content_tags, similar_to },
            pools.rankingPoolIds
          )
          const hasRanking = ranking.labels.length > 0
          const subResultLog =
            ranking.labels.map((l, i) => `${l}=${ranking.idLists[i].length}`).join(', ') || '(none)'
          console.log(
            `[Agent]   🔎 search_advanced ranking sub-results: ${subResultLog} | operation=${operation}`
          )

          // ── 4. Combine. With ranking sources, relevance decides; without them this is a
          //       filter-only query and the filter pool's tiered order is the only signal. ──
          const combined = hasRanking
            ? combineRankingResults(ranking, operation)
            : { ids: pools.filterPoolIds!, unionCount: undefined }
          // Only informative as a near-miss signal, i.e. when 2+ sources could disagree.
          const unionCount = ranking.labels.length >= 2 ? combined.unionCount : undefined

          let combinedIds = combined.ids
          let ordering: Ordering = hasRanking ? { kind: 'relevance' } : pools.filterOrdering!
          console.log(
            `[Agent]   🔎 search_advanced combined: ${combinedIds.length} IDs (order: ${formatOrdering(ordering)})` +
              (unionCount !== undefined ? ` | union would be ${unionCount}` : '')
          )
          if (combinedIds.length === 0) return emptyResult(ranking, unionCount)

          // ── 5. Explicit ordering overrides whatever order stage 4 produced ──
          let unscoredIds = new Set<number>()
          if (order_by) {
            ;({
              ids: combinedIds,
              ordering,
              unscoredIds,
            } = await _applyExplicitOrder(combinedIds, order_by))
          }

          // ── 6. Sample + format ──
          const sampledIds = combinedIds.slice(0, Math.min(Math.max(limit, 1), 50))
          const photos = await formatSearchResultPhotos(sampledIds, ranking)

          return JSON.stringify({
            querySummary: buildQuerySummary({
              operation,
              pools,
              candidateCount: combinedIds.length,
              returnedCount: photos.length,
              ordering,
              sourceCandidateCounts: buildSourceCandidateCounts(pools, ranking),
              unionCount,
              saturatedSources: saturatedRankingSources(ranking),
              unscoredCount: sampledIds.filter((id) => unscoredIds.has(id)).length,
            }),
            photos,
          })
        } catch (error) {
          // Bad input the model can correct (unknown scope, no selector) keeps its own message.
          if (error instanceof SearchInputError) return JSON.stringify({ error: error.message })
          return JSON.stringify({ error: `Advanced search failed: ${error.message}` })
        }
      },
      {
        name: 'search_advanced',
        description: TOOL_DESCRIPTIONS.search_advanced,
        schema: buildSearchAdvancedSchema(variant),
      }
    )

    // ── Tool: overall_catalog_view ─────────────────────────
    const overallCatalogView = tool(
      async (): Promise<string> => {
        try {
          const statsService = new StatsService()
          const user = await User.find(userId)
          const variant = getPromptVariant(user?.profiles ?? null)

          const [catalogPatterns, visualAspectsStats, artisticScoresStats] = await Promise.all([
            user
              ? Promise.resolve(formatCatalogPatternsForAgent(user.catalogPatterns, 'all'))
              : Promise.resolve(JSON.stringify({ error: 'User not found' })),
            statsService.getVisualAspectsStats(userId),
            statsService.getArtisticScoresStats(userId, variant),
          ])

          const report = {
            catalog_patterns: JSON.parse(catalogPatterns),
            visual_aspects_stats: visualAspectsStats,
            artistic_scores_stats: artisticScoresStats,
          }

          return JSON.stringify(report)
        } catch (error) {
          return JSON.stringify({ error: `Failed to build overall catalog view: ${error.message}` })
        }
      },
      {
        name: 'overall_catalog_view',
        description: TOOL_DESCRIPTIONS.overall_catalog_view,
        schema: OverallCatalogViewSchema,
      }
    )

    // ── Tool: app_knowledge ────────────────────────────────
    const appKnowledge = tool(
      async ({ section = 'all' }): Promise<string> => {
        try {
          if (section === 'all') {
            return JSON.stringify(APP_KNOWLEDGE_SECTIONS)
          }
          const key = section as AppKnowledgeSection
          return JSON.stringify({ section: key, content: APP_KNOWLEDGE_SECTIONS[key] })
        } catch (error) {
          return JSON.stringify({ error: `Failed to retrieve app knowledge: ${error.message}` })
        }
      },
      {
        name: 'app_knowledge',
        description: TOOL_DESCRIPTIONS.app_knowledge,
        schema: AppKnowledgeSchema,
      }
    )

    // ── Tools: fetch_collections / fetch_series ─────────────
    // In list-all mode, samplePhotoIds is only populated for the N most
    // recently created items — scores/totalPhotos are always complete
    // regardless, since they're cheap to compute for every item at once.
    const RECENT_SAMPLE_CUTOFF = 30
    const LIST_ALL_SAFETY_LIMIT = 300

    const formatCollectionOrSeries = (
      item: { id: number; name: string; description: string | null },
      photoIds: number[],
      sampleLimit: number,
      includeSample: boolean,
      scores: Record<string, ScoreAgg>
    ) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      totalPhotos: photoIds.length,
      samplePhotoIds: includeSample ? photoIds.slice(0, sampleLimit) : [],
      scores,
    })

    const fetchCollections = tool(
      async ({ collectionId }): Promise<string> => {
        try {
          if (collectionId) {
            const collection = await Collection.query()
              .where('id', collectionId)
              .where('user_id', userId)
              .first()
            if (!collection) {
              return JSON.stringify({ error: `Collection ${collectionId} not found` })
            }
            const photoMap = await fetchPivotPhotoScores(
              'collection_photos',
              'collection_id',
              userId,
              [collection.id]
            )
            const photos = photoMap.get(collection.id) ?? []
            return JSON.stringify({
              collections: [
                formatCollectionOrSeries(
                  collection,
                  photos.map((p) => p.id),
                  50,
                  true,
                  computeItemScores(photos, variant)
                ),
              ],
            })
          }

          const collections = await Collection.query()
            .where('user_id', userId)
            .orderBy('created_at', 'desc')
            .limit(LIST_ALL_SAFETY_LIMIT)

          const photoMap = await fetchPivotPhotoScores(
            'collection_photos',
            'collection_id',
            userId,
            collections.map((c) => c.id)
          )

          return JSON.stringify({
            collections: collections.map((c, idx) => {
              const photos = photoMap.get(c.id) ?? []
              return formatCollectionOrSeries(
                c,
                photos.map((p) => p.id),
                15,
                idx < RECENT_SAMPLE_CUTOFF,
                computeItemScores(photos, variant)
              )
            }),
          })
        } catch (error) {
          return JSON.stringify({ error: `Failed to fetch collections: ${error.message}` })
        }
      },
      {
        name: 'fetch_collections',
        description: TOOL_DESCRIPTIONS.fetch_collections,
        schema: FetchCollectionsSchema,
      }
    )

    const fetchSeries = tool(
      async ({ seriesId }): Promise<string> => {
        try {
          if (seriesId) {
            const series = await Series.query()
              .where('id', seriesId)
              .where('user_id', userId)
              .first()
            if (!series) {
              return JSON.stringify({ error: `Series ${seriesId} not found` })
            }
            const photoMap = await fetchPivotPhotoScores('series_photos', 'series_id', userId, [
              series.id,
            ])
            const photos = photoMap.get(series.id) ?? []
            return JSON.stringify({
              series: [
                formatCollectionOrSeries(
                  series,
                  photos.map((p) => p.id),
                  50,
                  true,
                  computeItemScores(photos, variant)
                ),
              ],
            })
          }

          const series = await Series.query()
            .where('user_id', userId)
            .orderBy('created_at', 'desc')
            .limit(LIST_ALL_SAFETY_LIMIT)

          const photoMap = await fetchPivotPhotoScores(
            'series_photos',
            'series_id',
            userId,
            series.map((s) => s.id)
          )

          return JSON.stringify({
            series: series.map((s, idx) => {
              const photos = photoMap.get(s.id) ?? []
              return formatCollectionOrSeries(
                s,
                photos.map((p) => p.id),
                15,
                idx < RECENT_SAMPLE_CUTOFF,
                computeItemScores(photos, variant)
              )
            }),
          })
        } catch (error) {
          return JSON.stringify({ error: `Failed to fetch series: ${error.message}` })
        }
      },
      {
        name: 'fetch_series',
        description: TOOL_DESCRIPTIONS.fetch_series,
        schema: FetchSeriesSchema,
      }
    )

    // ── Tool: fetch_portfolios ─────────────────────────────
    const formatPortfolioBuild = (
      b: any,
      builderPoolSampleLimit: number,
      scoresByPhotoId: Map<number, Record<string, number> | null>
    ) => {
      const cfg = b.config || ({} as any)
      const result = b.result || ({} as any)
      const photoIds: number[] = Array.isArray(result.photoIds) ? result.photoIds : []
      const builderPoolIds: number[] = Array.isArray(result.builderPool)
        ? result.builderPool
            .map((p: any) => Number(p?.id))
            .filter((n: number) => Number.isFinite(n))
        : []
      const scorePhotos: PhotoScoreRow[] = photoIds.map((id) => ({
        id,
        artisticScores: scoresByPhotoId.get(id) ?? null,
      }))
      return {
        id: b.id,
        name: cfg.name ?? null,
        createdAt: b.createdAt?.toISO?.() ?? null,
        targetSize: cfg.targetSize ?? null,
        coherenceMode: cfg.coherenceMode ?? null,
        sequencing: Boolean(cfg.sequencing),
        themePreferences: cfg.themePreferences ?? null,
        sequencingPreferences: cfg.sequencingPreferences ?? null,
        totalPhotos: photoIds.length,
        photoIds,
        scores: computeItemScores(scorePhotos, variant),
        builderPoolSample: builderPoolIds.slice(0, builderPoolSampleLimit),
        builderPoolTotal: builderPoolIds.length,
      }
    }

    const fetchPortfolios = tool(
      async ({ portfolioId }): Promise<string> => {
        try {
          if (portfolioId) {
            const build = await PortfolioBuild.query()
              .where('id', portfolioId)
              .where('user_id', userId)
              .first()
            if (!build) {
              return JSON.stringify({ error: `Portfolio ${portfolioId} not found` })
            }
            const photoIds: number[] = Array.isArray(build.result?.photoIds)
              ? build.result.photoIds
              : []
            const scoresByPhotoId = await fetchPhotoScoresByIds(userId, photoIds)
            return JSON.stringify({
              portfolios: [formatPortfolioBuild(build, 50, scoresByPhotoId)],
            })
          }

          const builds = await PortfolioBuild.query()
            .where('user_id', userId)
            .where('status', 'completed')
            .orderBy('created_at', 'desc')
            .limit(20)

          const allPhotoIds = [
            ...new Set(
              builds.flatMap((b) =>
                Array.isArray(b.result?.photoIds) ? (b.result.photoIds as number[]) : []
              )
            ),
          ]
          const scoresByPhotoId = await fetchPhotoScoresByIds(userId, allPhotoIds)

          return JSON.stringify({
            portfolios: builds.map((b) => formatPortfolioBuild(b, 15, scoresByPhotoId)),
          })
        } catch (error: any) {
          return JSON.stringify({ error: `Failed to fetch portfolios: ${error.message}` })
        }
      },
      {
        name: 'fetch_portfolios',
        description: TOOL_DESCRIPTIONS.fetch_portfolios,
        schema: FetchPortfoliosSchema,
      }
    )

    // ── Tool: catalog_sample ────────────────────────────────
    const catalogSample = tool(
      async ({
        buckets = 5,
        per_bucket = 10,
        sort_within,
        date_from,
        date_to,
        genre,
        scan_mode = 'technical',
      }): Promise<string> => {
        void scan_mode // consumed in Phase 2 via intermediateStep.input.scan_mode
        try {
          // Fetch all photos with date info
          const photos = await Photo.query()
            .where('user_id', userId)
            .select(
              'id',
              'original_file_name',
              'descriptions',
              'created_at',
              'inferred_location_id'
            )
            .preload('inferredLocation')
            .orderBy('created_at', 'asc')

          // Extract date for each photo and apply filters
          const dateFromMs = date_from ? new Date(date_from).getTime() : null
          const dateToMs = date_to ? new Date(date_to + 'T23:59:59').getTime() : null
          const genreSet =
            genre && genre.length > 0 ? new Set(genre.map((g: string) => g.toLowerCase())) : null

          const withDate = photos
            .map((photo) => {
              const descriptions = photo.descriptions || {}
              const exifData = (descriptions.EXIF ?? {}) as Record<string, any>
              const visualAspects = (descriptions.visual_aspects ?? {}) as Record<string, any>
              const dateTakenRaw = exifData.dateTaken as string | undefined
              const ms = dateTakenRaw
                ? new Date(dateTakenRaw).getTime()
                : new Date(photo.createdAt.toString()).getTime()
              const rawGenre = visualAspects.genre
              const genreValue: string | null = Array.isArray(rawGenre)
                ? (rawGenre[0] ?? null)
                : ((rawGenre as string) ?? null)
              return { photo, ms, genre: genreValue }
            })
            .filter(({ ms, genre: photoGenre }) => {
              if (dateFromMs !== null && ms < dateFromMs) return false
              if (dateToMs !== null && ms > dateToMs) return false
              if (genreSet && (!photoGenre || !genreSet.has(photoGenre.toLowerCase()))) return false
              return true
            })
            .sort((a, b) => a.ms - b.ms)

          if (withDate.length === 0) {
            return JSON.stringify({ total_sampled: 0, buckets: [] })
          }

          // Divide timeline into equal buckets
          const minMs = withDate[0].ms
          const maxMs = withDate[withDate.length - 1].ms
          const range = maxMs - minMs

          const effectiveBuckets = range === 0 ? 1 : Math.min(buckets, withDate.length)
          const bucketSize = range === 0 ? 1 : range / effectiveBuckets

          // Assign photos to buckets
          const bucketMap = new Map<number, typeof withDate>()
          for (const entry of withDate) {
            const bucketIdx =
              range === 0
                ? 0
                : Math.min(Math.floor((entry.ms - minMs) / bucketSize), effectiveBuckets - 1)
            if (!bucketMap.has(bucketIdx)) bucketMap.set(bucketIdx, [])
            bucketMap.get(bucketIdx)!.push(entry)
          }

          // Sample from each bucket and build structured output
          const resultBuckets: any[] = []
          let totalSampled = 0

          for (let b = 0; b < effectiveBuckets; b++) {
            const bucketPhotos = bucketMap.get(b) ?? []
            if (bucketPhotos.length === 0) continue

            let selected: typeof withDate
            if (sort_within) {
              const internalSortWithin = toInternalField(sort_within)
              selected = [...bucketPhotos]
                .sort((a, b_) => {
                  const aScore =
                    ((a.photo.descriptions?.artistic_scores as Record<string, number>) ?? {})[
                      internalSortWithin
                    ] ?? -1
                  const bScore =
                    ((b_.photo.descriptions?.artistic_scores as Record<string, number>) ?? {})[
                      internalSortWithin
                    ] ?? -1
                  return bScore - aScore
                })
                .slice(0, per_bucket)
            } else {
              const pool = [...bucketPhotos]
              const count = Math.min(per_bucket, pool.length)
              for (let i = 0; i < count; i++) {
                const j = i + Math.floor(Math.random() * (pool.length - i))
                ;[pool[i], pool[j]] = [pool[j], pool[i]]
              }
              selected = pool.slice(0, count)
            }

            // Preserve chronological order within bucket
            selected.sort((a, b_) => a.ms - b_.ms)

            // Build period label
            const periodStart = new Date(bucketPhotos[0].ms).toISOString().slice(0, 10)
            const periodEnd = new Date(bucketPhotos[bucketPhotos.length - 1].ms)
              .toISOString()
              .slice(0, 10)
            const period = periodStart === periodEnd ? periodStart : `${periodStart} → ${periodEnd}`

            resultBuckets.push({
              period,
              total_in_period: bucketPhotos.length,
              photos: selected.map((s) => photoDataForAgentSlim(s.photo)),
            })
            totalSampled += selected.length
          }

          console.log(
            `[Agent]   🎲 catalog_sample: ${effectiveBuckets} buckets, ${totalSampled} photos sampled` +
              (sort_within ? ` (top by ${sort_within})` : ' (random)') +
              (genreSet ? ` [genre: ${[...genreSet].join(', ')}]` : '')
          )

          return JSON.stringify({ total_sampled: totalSampled, buckets: resultBuckets })
        } catch (error) {
          return JSON.stringify({ error: `Catalog sampling failed: ${error.message}` })
        }
      },
      {
        name: 'catalog_sample',
        description: TOOL_DESCRIPTIONS.catalog_sample,
        schema: buildCatalogSampleSchema(variant),
      }
    )

    const webSearch = tool(
      async ({ query, max_results = 3 }): Promise<string> => {
        const apiKey = process.env.TAVILY_API_KEY
        if (!apiKey) {
          return JSON.stringify({ error: 'TAVILY_API_KEY not configured.' })
        }
        try {
          const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results,
              include_answer: true,
              include_raw_content: false,
              include_images: false,
            }),
          })
          if (!res.ok) {
            return JSON.stringify({ error: `Tavily API error: ${res.status} ${res.statusText}` })
          }
          const data: any = await res.json()
          // Compact output: answer summary + trimmed snippets only
          const results = (data.results ?? []).map((r: any) => ({
            title: (r.title ?? '').slice(0, 120),
            url: r.url ?? '',
            snippet: (r.content ?? '').slice(0, 350),
          }))
          const output: any = { total: results.length, results }
          if (data.answer) output.answer = (data.answer as string).slice(0, 400)
          console.log(
            `[Agent]   🌐 web_search: "${query}" → ${results.length} result(s)${
              data.answer ? ' + answer summary' : ''
            }`
          )
          return JSON.stringify(output)
        } catch (error: any) {
          return JSON.stringify({ error: `Web search failed: ${error.message}` })
        }
      },
      {
        name: 'web_search',
        description: TOOL_DESCRIPTIONS.web_search,
        schema: WebSearchSchema,
      }
    )

    // ── Tool: tag_distribution ─────────────────────────────
    const tagDistribution = tool(
      async ({ tags, limit = 15 }): Promise<string> => {
        try {
          const tagManager = new TagManager()
          const mainTags = !tags || tags.length === 0
          // Each entry is a category — one or more synonyms to merge, normalized/deduped.
          const groups = mainTags
            ? []
            : tags!.map((synonyms) => [...new Set(synonyms.map((t) => t.trim().toLowerCase()))])
          const labels = groups.map((g) => g[0])

          const result = await tagManager.getTreemap(
            userId.toString(),
            mainTags,
            groups,
            true, // includeContained — always loose/whole-word match, tolerates multi-word tag variants
            limit
          )

          // getTreemap drops zero-count rows, so any requested category missing from
          // result.tags had no real match — surface it instead of letting it vanish silently.
          if (!mainTags) {
            const foundNames = new Set(result.tags.map((t) => t.name))
            const unresolvedTags = labels.filter((label) => !foundNames.has(label))
            if (unresolvedTags.length > 0) {
              return JSON.stringify({ ...result, unresolvedTags })
            }
          }

          return JSON.stringify(result)
        } catch (error: any) {
          return JSON.stringify({ error: `Tag distribution failed: ${error.message}` })
        }
      },
      {
        name: 'tag_distribution',
        description: TOOL_DESCRIPTIONS.tag_distribution,
        schema: TagDistributionSchema,
      }
    )

    return [
      getPhotoInfo,
      appKnowledge,
      searchAdvanced,
      fetchCollections,
      fetchSeries,
      fetchPortfolios,
      overallCatalogView,
      catalogSample,
      tagDistribution,
      webSearch,
    ]
  }
}
