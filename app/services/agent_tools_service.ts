// @ts-nocheck
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import { APP_KNOWLEDGE_SECTIONS, AppKnowledgeSection } from '../utils/app_knowledge_content.js'
import ScoringService from './scoring_service.js'
import StatsService from './stats_service.js'
import SearchPhotoService from './search_photo_service.js'
import VectorService from './vector_service.js'
import { EmbeddingStoreService, EmbeddingType } from './embeddings_store_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import Collection from '#models/collection'
import Series from '#models/series'
import PortfolioBuild from '#models/portfolio_build'
import {
  VISUAL_ASPECTS_SCHEMA,
  ALL_ARTISTIC_SCORE_EXTERNAL_KEYS,
  resolveInternalScoreKeyAnyVariant,
  getPromptVariant,
  getArtisticExternalKeys,
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

export const FetchCollectionsSchema = z.object({})

export const FetchPortfoliosSchema = z.object({})

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
        'How to combine results from the sub-searches declared below.\n' +
          '- intersect: return only photos that appear in ALL sub-search results (AND logic). Use when the user wants photos matching every criterion simultaneously (e.g. "black and white portraits of dogs").\n' +
          '- union: return photos that appear in ANY sub-search result (OR logic). Use when the user wants photos matching at least one criterion (e.g. "photos of cats or dogs").'
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
        sortByScore: scoreField.optional().describe('Sort results by this artistic score.'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction.'),
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
        'Structured metadata/attribute filter. Triggers filter_photos logic. Do NOT place artistic score names in visualAspects — those belong in scoreFilters.'
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
 * understand what the photo depicts, but omits heavy metadata (scores,
 * visual_aspects, EXIF, notes) — those are injected automatically in Phase 2
 * via buildPhase2VisualContext with full data + thumbnail images.
 */
export function photoDataForAgentPreview(photo: any): Record<string, any> {
  const descriptions = photo.descriptions || {}
  const exif = descriptions.EXIF || {}
  const visualAspects = descriptions.visual_aspects || {}
  return {
    id: photo.id,
    originalFileName: photo.originalFileName,
    story: descriptions.story || null,
    context: descriptions.context || null,
    genre: visualAspects.genre ?? null,
    dateTaken: exif.dateTaken ?? null,
  }
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
// Tool descriptions (centralised)
// ─────────────────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS = {
  get_photo_info:
    '[BASIC_TOOLS] Get detailed info for one or more photos by their IDs. Call this ONLY for: (1) photo IDs attached by the user in the current message (these are auto-prefetched), (2) photo IDs referenced from conversation history that you need to discuss again. Do NOT call this on photos returned by search_advanced — a later phase automatically injects full descriptions and thumbnails. Pass multiple IDs in a single call to batch-fetch. Returns: story (scene narrative), context, genre, and date taken. Full visual metadata and thumbnail images are provided automatically in the final evaluation step.',

  fetch_collections:
    "[BASIC_TOOLS] Get all the user's collections and series, each with their name, description, and sample photo IDs. Use this when the user asks about their collections, series, albums, or organized groups of photos — for example 'what collections do I have?', 'show me my series', 'which albums exist?'. Returns two separate arrays: 'collections' (manually curated groups) and 'series' (ordered sequences/stories). **Important:** this tool only returns metadata and a small sample of IDs per collection — it does NOT provide full photo descriptions or visual thumbnails. Once you identify the collection(s) the user cares about, call `get_photo_info` with those photo IDs to retrieve full descriptions and visuals for evaluation. Exception: if the user only wants a high-level overview of their collections (names, counts, structure), you do NOT need to call `get_photo_info`.",

  fetch_portfolios:
    "[BASIC_TOOLS] Get all the user's portfolio builds (AI-generated curated portfolios produced by the Portfolio Builder tool). Returns only COMPLETED builds, most recent first, each with its id, name, creation date, target size, coherence mode (free/visual/chromatic/narrative/heterogeneous), whether sequencing was enabled, the user's theme and sequencing preferences, the final ordered photo IDs of the portfolio, and a sample of the builder pool (approved-but-not-selected alternatives). Use this whenever the user asks about their portfolios, generated portfolios, portfolio builds, curated selections, or references an earlier build — for example 'show me my last portfolio', 'what portfolios have I built?', 'open the street portfolio I made'. **Important:** this tool only returns metadata and photo IDs — it does NOT provide full photo descriptions or visual thumbnails. Once you identify the portfolio(s) the user cares about, call `get_photo_info` on a subset of the relevant photo IDs to retrieve descriptions and visuals for evaluation. Exception: if the user only wants a high-level overview of their portfolios (names, counts, config), no `get_photo_info` call is needed.",

  search_advanced:
    '[PHOTO_SEARCH] **The primary search tool.** Combine multiple search strategies in a single call and merge their results with intersect (AND) or union (OR). You can specify any combination of: (1) style_query — semantic style/mood search, (2) content_tags — subject/content keyword search, (3) filter — metadata/score/visual-aspect filtering, (4) similar_to — similarity to reference photos. **ALL parameters MUST ALWAYS BE SPECIFIED IN ENGLISH ONLY** — style descriptions, keywords, and filter values must be in English. All specified sub-searches run in parallel; their full ID sets are combined via the chosen operation; only the final result is sampled and returned with photo ID, filename, and genre. Full metadata, descriptions, and thumbnail images are provided automatically in the final evaluation step — do NOT call get_photo_info on these results. Examples: "black and white street photos with dogs" → filter(palette=b&w, genre=street) + content_tags(["dog"]) with intersect. "moody portraits or landscapes" → style_query("dark moody") + filter(genre=[portrait,landscape]) with union.',

  catalog_sample:
    '[CATALOG_INSIGHT] **Temporal catalog sampling for broad exploration.** Divides the catalog timeline into equal time buckets and samples representative photos from each period. Returns structured data: an array of buckets, each with its date range and sampled photos. Use this for evolution questions, progress over time, or getting a representative cross-section of the catalog. Always pair with `overall_catalog_view` in parallel for holistic context. NEVER use this for targeted searches — use `search_advanced` instead. Optional filters: **genre values MUST ALWAYS BE IN ENGLISH ONLY** (e.g. ["street"] for street photography evolution), date_from/date_to, sort_within (pick best-scored photos per period instead of random), scan_mode (technical for compositional/visual analysis, semantic for subject/theme analysis). Examples: "How has my photography evolved?" → catalog_sample(buckets=6, scan_mode=technical) + overall_catalog_view in parallel. "What subjects appear most in my street work?" → catalog_sample(buckets=5, genre=["street"], scan_mode=semantic) + overall_catalog_view in parallel.',

  overall_catalog_view:
    '[CATALOG_INSIGHT] Get a single combined report of the entire catalog: catalog patterns (recurring themes, subjects, narrative motifs), visual aspects distribution, and artistic scores statistics. Use this as the FIRST tool whenever the user asks for advice on improving their photography, critique of their catalog, identification of weak points or strengths, general feedback on their style, or any holistic question about their photographic practice. This tool replaces calling get_catalog_patterns + stats_visual_aspects + stats_artistic_scores individually — it returns all of that data in one shot.',

  app_knowledge:
    "[BASIC_TOOLS] Get useful information about the Photoreka application itself. Use this whenever the user asks about how the app works, what features are available, how to use a specific feature, pricing, data limits, privacy policy, terms of use, data handling, account management, or any general help question unrelated to their photo catalog. Returns one or both sections: 'terms_and_privacy' (legal terms and privacy policy) and 'usage_and_help' (feature overview, FAQ, tips).",

  web_search:
    '[EXTERNAL_INFO] Search the internet for factual, current, or external information not present in the photo catalog. Use ONLY for: photography techniques and tutorials, camera/lens gear specs and reviews, photographer biographies and references, photographic movements and history, software tools, or any external context the user explicitly asks about. Do NOT use for questions that can be answered from the catalog or app knowledge. Use max_results=1-2 for simple factual lookups (e.g. "what is the hyperfocal distance formula"), 3-5 for comparative or research questions. **Sequencing:** call this tool FIRST whenever the results of this search are needed to determine the parameters of a subsequent tool call. Only call it in parallel with other tools when those tools\u2019 parameters are already fully defined without the web results.',
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
    // Returns story + context + genre + dateTaken for attached/referenced photos.
    // Full metadata and thumbnail images are injected in Phase 2 by
    // buildPhase2VisualContext — no need to include them here.
    const getPhotoInfo = tool(
      async ({ photoIds: ids }): Promise<string> => {
        const photos = await photoManager.getPhotosByIds(ids)
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
    const _getIdsByStyle = async (query: string): Promise<number[]> => {
      await EmbeddingStoreService.calculateEmbeddings([query], true, false)
      const embedding = EmbeddingStoreService.getEmbedding(query, EmbeddingType.CLIP)
      if (!embedding) return []

      const allPhotoIds = await photoManager.getPhotosIdsForSearch(userId.toString())
      const vectorService = new VectorService()
      const results = await vectorService.findSimilarPhotoToEmbedding(
        embedding,
        0.15,
        250,
        'cosine_similarity',
        allPhotoIds
      )
      return results.map((r: any) => r.id as number)
    }

    /** Content/tag search → returns all matching photo IDs (no limit). */
    const _getIdsByContent = async (tags: string[]): Promise<number[]> => {
      const scoringService = new ScoringService()
      const allPhotoIds = await photoManager.getPhotosIdsForSearch(userId.toString())
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
    const _getIdsByFilter = async (args: {
      scoreFilters?: { field: string; min?: number; max?: number }[]
      sortByScore?: string
      sortOrder?: 'asc' | 'desc'
      visualAspects?: Record<string, string[]>
      filenameLike?: string
      dateFrom?: string
      dateTo?: string
    }): Promise<number[]> => {
      const {
        scoreFilters,
        visualAspects,
        filenameLike,
        dateFrom,
        dateTo,
        sortByScore,
        sortOrder = 'desc',
      } = args
      const photos = await Photo.query()
        .where('user_id', userId)
        .select('id', 'original_file_name', 'descriptions', 'created_at')
        .orderBy('created_at', 'desc')

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

      // Sort if requested
      if (sortByScore) {
        const internalSortField = toInternalField(sortByScore)
        filtered.sort((a, b) => {
          const aScore =
            ((a.descriptions?.artistic_scores as Record<string, number>) ?? {})[
              internalSortField
            ] ?? -1
          const bScore =
            ((b.descriptions?.artistic_scores as Record<string, number>) ?? {})[
              internalSortField
            ] ?? -1
          return sortOrder === 'asc' ? aScore - bScore : bScore - aScore
        })
      } else if (sortOrder === 'asc') {
        filtered.reverse()
      }

      return filtered.map((p) => p.id)
    }

    /** Similarity search → returns all matching photo IDs (no limit). */
    const _getIdsBySimilarity = async (args: {
      anchor_photo_ids: number[]
      criteria: string
      opposite?: boolean
    }): Promise<number[]> => {
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
          resultLength: 250,
        },
        userId
      )
      return results.map((p: any) => p.id as number)
    }

    // (catalog_sample is now a standalone tool — see below)

    // ── Tool: search_advanced ───────────────────────────────
    const searchAdvanced = tool(
      async ({ operation, style_query, content_tags, filter, similar_to }): Promise<string> => {
        // Limit is intentionally not exposed to the model — Phase 1 always returns
        // the maximum so Phase 2 (the curator) can make the final selection.
        // Keep in sync with PHASE2_TOTAL_IMAGE_LIMIT in langchain_agent_service.ts.
        const limit = 20
        try {
          // Dispatch all sub-searches in parallel
          const subSearches: Promise<number[]>[] = []
          const subLabels: string[] = []

          if (style_query) {
            subSearches.push(_getIdsByStyle(style_query))
            subLabels.push('style')
          }
          if (content_tags && content_tags.length > 0) {
            subSearches.push(_getIdsByContent(content_tags))
            subLabels.push('content')
          }
          if (filter) {
            subSearches.push(_getIdsByFilter(filter))
            subLabels.push('filter')
          }
          if (similar_to) {
            subSearches.push(_getIdsBySimilarity(similar_to))
            subLabels.push('similar')
          }

          if (subSearches.length === 0) {
            return JSON.stringify({
              error:
                'No sub-searches specified. Provide at least one of: style_query, content_tags, filter, similar_to.',
            })
          }

          const results = await Promise.all(subSearches)

          // Log sub-search sizes
          const logParts = subLabels.map((label, i) => `${label}=${results[i].length}`)
          console.log(
            `[Agent]   🔎 search_advanced sub-results: ${logParts.join(', ')} | operation=${operation}`
          )

          // Combine using RRF to preserve ranking signal from all sub-searches,
          // then apply intersect/union as the set operation.
          const rrfRanked = reciprocalRankFusion(results)

          let combinedIds: number[]
          if (operation === 'intersect') {
            // Keep only IDs present in every sub-search result, ordered by RRF score
            const sets = results.map((ids) => new Set(ids))
            combinedIds = rrfRanked.filter((id) => sets.every((s) => s.has(id)))
          } else {
            // Union — all IDs already deduplicated and ranked by RRF
            combinedIds = rrfRanked
          }

          console.log(
            `[Agent]   🔎 search_advanced combined: ${combinedIds.length} IDs after ${operation}`
          )

          if (combinedIds.length === 0) {
            return JSON.stringify({
              returned: 0,
              // hasMore: false,
              operation,
              subSearches: subLabels,
              photos: [],
            })
          }

          // Sample to limit
          const clampedLimit = Math.min(Math.max(limit, 1), 50)
          const sampledIds = combinedIds.slice(0, clampedLimit)

          // Fetch slim photo data for Phase 1 — full data + images are
          // provided exclusively in Phase 2 via buildPhase2VisualContext.
          const photos = await photoManager.getPhotosByIds(sampledIds)
          const photoMap = new Map(photos.map((p) => [p.id, p]))
          const formatted = sampledIds
            .map((id) => {
              const p = photoMap.get(id)
              if (!p) return null
              return photoDataForAgentSlim(p)
            })
            .filter(Boolean)

          return JSON.stringify({
            returned: formatted.length,
            // hasMore: combinedIds.length > formatted.length,
            operation,
            subSearches: subLabels,
            photos: formatted,
          })
        } catch (error) {
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

    // ── Tool: fetch_collections ────────────────────────────
    const fetchCollections = tool(
      async (): Promise<string> => {
        try {
          const [collections, series] = await Promise.all([
            Collection.query()
              .where('user_id', userId)
              .preload('photos', (q) => q.select('id')),
            Series.query()
              .where('user_id', userId)
              .preload('photos', (q) => q.select('id')),
          ])

          return JSON.stringify({
            collections: collections.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              totalPhotos: c.photos.length,
              samplePhotoIds: c.photos.slice(0, 15).map((p) => p.id),
            })),
            series: series.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              totalPhotos: s.photos.length,
              samplePhotoIds: s.photos.slice(0, 15).map((p) => p.id),
            })),
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

    // ── Tool: fetch_portfolios ─────────────────────────────
    const fetchPortfolios = tool(
      async (): Promise<string> => {
        try {
          const builds = await PortfolioBuild.query()
            .where('user_id', userId)
            .where('status', 'completed')
            .orderBy('created_at', 'desc')
            .limit(20)

          return JSON.stringify({
            portfolios: builds.map((b) => {
              const cfg = b.config || ({} as any)
              const result = b.result || ({} as any)
              const photoIds: number[] = Array.isArray(result.photoIds) ? result.photoIds : []
              const builderPoolIds: number[] = Array.isArray(result.builderPool)
                ? result.builderPool
                    .map((p: any) => Number(p?.id))
                    .filter((n: number) => Number.isFinite(n))
                : []
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
                builderPoolSample: builderPoolIds.slice(0, 15),
                builderPoolTotal: builderPoolIds.length,
              }
            }),
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
            .select('id', 'original_file_name', 'descriptions', 'created_at')
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

    return [
      getPhotoInfo,
      appKnowledge,
      searchAdvanced,
      fetchCollections,
      fetchPortfolios,
      overallCatalogView,
      catalogSample,
      webSearch,
    ]
  }
}
