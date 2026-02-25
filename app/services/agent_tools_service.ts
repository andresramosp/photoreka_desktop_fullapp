// @ts-nocheck
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import { APP_KNOWLEDGE_SECTIONS, AppKnowledgeSection } from '../utils/app_knowledge_content.js'
import ScoringService from './scoring_service.js'
import PhotoImageService from './photo_image_service.js'
import StatsService from './stats_service.js'
import SearchPhotoService from './search_photo_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import Collection from '#models/collection'
import Series from '#models/series'

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

export const ScoreField = z.enum([
  'aesthetic_quality',
  'composition',
  'storytelling',
  'strangeness',
  'message',
  'humor',
  'visual_games',
  'candidness',
])

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

export const SearchAdvancedSchema = z.object({
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
      'Natural language description of the visual style to find. Focus on style, composition, mood, color palette, atmosphere. Always in english. Triggers an embedding-based semantic style search.'
    ),
  content_tags: z
    .array(z.string())
    .min(1)
    .max(3)
    .optional()
    .describe(
      'Between 1 and 3 keywords describing concrete subjects, narrative elements, or specific content (e.g. ["dog", "running"]). Always in english. Triggers a tag-based content search.'
    ),
  filter: z
    .object({
      scoreFilters: z
        .array(
          z.object({
            field: ScoreField.describe('Artistic score field to filter on'),
            min: z.number().optional().describe('Minimum score (inclusive), 0–10'),
            max: z.number().optional().describe('Maximum score (inclusive), 0–10'),
          })
        )
        .optional()
        .describe('Filter by numeric artistic scores. Multiple entries are ANDed.'),
      sortByScore: ScoreField.optional().describe('Sort results by this artistic score.'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('Sort direction.'),
      visualAspects: z
        .object({
          genre: z.array(z.string()).optional(),
          framing: z.array(z.string()).optional(),
          focus: z.array(z.string()).optional(),
          lighting: z.array(z.string()).optional(),
          lighting_scheme: z.array(z.string()).optional(),
          depth_of_field: z.array(z.string()).optional(),
          perspective: z.array(z.string()).optional(),
          stylistic: z.array(z.string()).optional(),
          orientation: z.array(z.string()).optional(),
          temperature: z.array(z.string()).optional(),
          palette: z.array(z.string()).optional(),
        })
        .optional()
        .describe(
          'Filter by categorical visual aspect values. Valid keys: genre, framing, focus, lighting, lighting_scheme, depth_of_field, perspective, stylistic, orientation, temperature, palette. Accepted values per key — genre: abstract|documentary|street|landscape|portrait; framing: close-up|medium shot|wide shot; focus: blurry|nitid; lighting: natural|artificial|backlit|frontlit|side lit; lighting_scheme: low key|high key|balanced; depth_of_field: shallow|deep|medium; perspective: normal|high angle|low angle; stylistic: long exposure|motion blur|silhouettes|bokeh|grain; orientation: portrait|landscape|square; temperature: warm|cold|neutral; palette: color|black and white.'
        ),
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
  limit: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum number of final results to return after combining (default 20, max 50).'),
})

export const FilterPhotosSchema = z.object({
  scoreFilters: z
    .array(
      z.object({
        field: ScoreField.describe('Artistic score field to filter on'),
        min: z.number().optional().describe('Minimum score (inclusive), 0–10'),
        max: z.number().optional().describe('Maximum score (inclusive), 0–10'),
      })
    )
    .optional()
    .describe(
      'Filter by numeric artistic score fields (aesthetic_quality, composition, storytelling, strangeness, message, humor, visual_games, candidness). These are ALL numeric scores 0–10. Multiple entries are ANDed. Omit to skip score filtering. NEVER put score names inside visualAspects.'
    ),
  sortByScore: ScoreField.optional().describe(
    'Sort results by this artistic score (use with sortOrder). Omit to sort by date.'
  ),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc')
    .describe('Sort direction (default desc — highest first / most recent first)'),
  visualAspects: z
    .object({
      genre: z.array(z.string()).optional(),
      framing: z.array(z.string()).optional(),
      focus: z.array(z.string()).optional(),
      lighting: z.array(z.string()).optional(),
      lighting_scheme: z.array(z.string()).optional(),
      depth_of_field: z.array(z.string()).optional(),
      perspective: z.array(z.string()).optional(),
      stylistic: z.array(z.string()).optional(),
      orientation: z.array(z.string()).optional(),
      temperature: z.array(z.string()).optional(),
      palette: z.array(z.string()).optional(),
    })
    .optional()
    .describe(
      'Filter by categorical visual aspect values. ONLY these keys are valid: genre, framing, focus, lighting, lighting_scheme, depth_of_field, perspective, stylistic, orientation, temperature, palette. Do NOT place artistic score names (e.g. visual_games, humor, strangeness) here — those are numeric scores and belong in scoreFilters. Each key accepts an array of valid values (OR within a key, AND across keys). Accepted values per key — genre: abstract|documentary|street|landscape|portrait; framing: close-up|medium shot|wide shot; focus: blurry|nitid; lighting: natural|artificial|backlit|frontlit|side lit; lighting_scheme: low key|high key|balanced; depth_of_field: shallow|deep|medium; perspective: normal|high angle|low angle; stylistic: long exposure|motion blur|silhouettes|bokeh|grain; orientation: portrait|landscape|square; temperature: warm|cold|neutral; palette: color|black and white.'
    ),
  filenameLike: z
    .string()
    .optional()
    .describe('Filter photos whose filename contains this string (case-insensitive)'),
  dateFrom: z
    .string()
    .optional()
    .describe('Include only photos taken on or after this date (ISO 8601, e.g. 2024-01-01)'),
  dateTo: z
    .string()
    .optional()
    .describe('Include only photos taken on or before this date (ISO 8601, e.g. 2024-12-31)'),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum number of results to return (default 20)'),
  candidate_ids: z
    .array(z.number())
    .optional()
    .describe(
      'Optional array of photo IDs to restrict filtering to a pre-selected pool. When provided, only these photos are considered. Use this to chain multiple search/filter steps.'
    ),
})

export const SearchSemanticOverallStyleSchema = z.object({
  query: z
    .string()
    .describe(
      'Natural language description of the visual style to find. Focus on style, composition, mood, color palette, atmosphere. Always in english, regardless of user language.'
    ),
  pageSize: z
    .number()
    .optional()
    .default(20)
    .describe('Number of results to return (default 20, max 50)'),
  minMatchScore: z
    .number()
    .optional()
    .describe('Minimum match score threshold from 0 to 1 (default 0.2 for broad search)'),
  candidate_ids: z
    .array(z.number())
    .optional()
    .describe(
      'Optional array of photo IDs to restrict the search pool. When provided, semantic style search is performed only among these photos. Use this to chain with a previous filter_photos or search result.'
    ),
})

export const SearchSemanticContentSchema = z.object({
  tags: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe(
      'Between 1 and 3 keywords describing concrete subjects, narrative elements, or specific content present in the photos (e.g. ["dog", "running"] or ["market", "crowd"]). Always in english, regardless of user language.'
    ),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum number of results to return (default 20)'),
  candidate_ids: z
    .array(z.number())
    .optional()
    .describe(
      'Optional array of photo IDs to restrict the search pool. When provided, content search is performed only among these photos. Use this to chain with a previous filter_photos or search result.'
    ),
})

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────

export function photoDataForAgent(photo: any, extra?: Record<string, any>): Record<string, any> {
  const descriptions = photo.descriptions || {}
  return {
    id: photo.id,
    originalFileName: photo.originalFileName,
    story: descriptions.story || null,
    context: descriptions.context || null,
    visual_accents: descriptions.visual_accents || null,
    visual_aspects: descriptions.visual_aspects || null,
    artistic_scores: descriptions.artistic_scores || null,
    exif: descriptions.EXIF || null,
    notes: descriptions.notes || null,
    ...extra,
  }
}

export function formatPhotoForAgent(photo: any): string {
  return JSON.stringify(photoDataForAgent(photo), null, 2)
}

export function formatSearchResultsForAgent(result: any): string {
  const raw = result.data.results[1] || []
  const photosArray = Array.isArray(raw) ? raw : []

  const formatted = photosArray.slice(0, 50).map((entry: any) => {
    const p = entry.photo ?? entry
    const matchScore = p.matchScore !== undefined ? Math.round(p.matchScore * 100) / 100 : undefined
    return photoDataForAgent(p, matchScore !== undefined ? { matchScore } : undefined)
  })

  return JSON.stringify({ totalFound: photosArray.length, photos: formatted }, null, 2)
}

export function formatContextPhotoBasic(photo: any): string {
  const descriptions = photo.descriptions || {}

  return JSON.stringify(
    {
      id: photo.id,
      originalFileName: photo.originalFileName,
      visual_aspects: descriptions.visual_aspects || null,
    },
    null,
    2
  )
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
    return JSON.stringify(cleaned, null, 2)
  }

  const requested = patternData[reviewType]
  return JSON.stringify(
    {
      reviewType,
      patterns: stripClusterPhotos(requested) || [],
    },
    null,
    2
  )
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
    '[BASIC_TOOLS] Get full details and thumbnail image of one or more photos by their IDs. MUST be called before discussing, comparing, or operating on any photo — including photos the user has attached (prefixed as [Attached photo IDs: ...] in the message) and photos referenced from conversation history. Pass multiple IDs in a single call to batch-fetch. Returns full photo data (artistic scores, story, context, visual aspects, visual accents, EXIF, tags) plus the thumbnail image for visual analysis.',

  fetch_collections:
    "[BASIC_TOOLS] Get all the user's collections and series, each with their name, description, and up to 10 sample photo IDs. Use this when the user asks about their collections, series, albums, or organized groups of photos — for example 'what collections do I have?', 'show me my series', 'which albums exist?'. Returns two separate arrays: 'collections' (manually curated groups) and 'series' (ordered sequences/stories).",

  search_advanced:
    '[PHOTO_SEARCH] **The primary search tool.** Combine multiple search strategies in a single call and merge their results with intersect (AND) or union (OR). You can specify any combination of: (1) style_query — semantic style/mood search, (2) content_tags — subject/content keyword search, (3) filter — metadata/score/visual-aspect filtering, (4) similar_to — similarity to reference photos. All specified sub-searches run in parallel; their full ID sets are combined via the chosen operation; only the final result is sampled and returned with full photo data. This eliminates result loss from sequential filtering. Examples: "black and white street photos with dogs" → filter(palette=b&w, genre=street) + content_tags(["dog"]) with intersect. "Photos of cats or dogs" → content_tags(["cat"]) + content_tags(["dog"]) — not possible, use two calls or a single content_tags(["cat", "dog"]). "Melancholic portraits" → style_query("melancholic mood") + filter(genre=portrait) with intersect.',

  overall_catalog_view:
    '[CATALOG_INSIGHT] Get a single combined report of the entire catalog: catalog patterns (recurring themes, subjects, narrative motifs), visual aspects distribution, and artistic scores statistics. Use this as the FIRST tool whenever the user asks for advice on improving their photography, critique of their catalog, identification of weak points or strengths, general feedback on their style, or any holistic question about their photographic practice. This tool replaces calling get_catalog_patterns + stats_visual_aspects + stats_artistic_scores individually — it returns all of that data in one shot.',

  app_knowledge:
    "[BASIC_TOOLS] Get useful information about the Photoreka application itself. Use this whenever the user asks about how the app works, what features are available, how to use a specific feature, pricing, data limits, privacy policy, terms of use, data handling, account management, or any general help question unrelated to their photo catalog. Returns one or both sections: 'terms_and_privacy' (legal terms and privacy policy) and 'usage_and_help' (feature overview, FAQ, tips).",
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
  createTools(userId: number, foundPhotoIds: number[], provider: 'openai' | 'gemini' = 'openai') {
    const { photoManager, searchService } = this

    // ── Tool 1: get_photo_info ──────────────────────────────
    const getPhotoInfo = tool(
      async ({ photoIds: ids }): Promise<string> => {
        const photoImageService = PhotoImageService.getInstance()

        const fetchImages = ids.length < 5

        const photos = await photoManager.getPhotosByIds(ids)
        const photoMap = new Map(photos.map((p) => [p.id, p]))

        const results = await Promise.all(
          ids.map(async (photoId: number) => {
            const photo = photoMap.get(photoId)
            if (!photo)
              return {
                text: JSON.stringify({ photoId, error: `Photo ${photoId} not found` }),
                imageUrl: null,
                base64: null,
              }

            // OpenAI: pass the thumbnail URL directly (no R2 fetch needed).
            // Gemini: fetch from R2 and send as inline base64 (native Gemini format).
            let imageUrl: string | null = null
            let base64: string | null = null

            if (fetchImages) {
              if (provider === 'openai') {
                imageUrl = photo.thumbnailUrl ?? null
              } else {
                // Gemini — inline base64
                try {
                  base64 = (await photoImageService.getImageBase64FromR2(
                    photo.thumbnailName,
                    false
                  )) as string
                } catch {
                  // image fetch failed — continue without image
                }
              }
            }

            return { text: formatPhotoForAgent(photo), imageUrl, base64 }
          })
        )

        // Build content parts — only include images if they were fetched
        const hasImages = results.some(
          ({ base64, imageUrl }) => base64 !== null || imageUrl !== null
        )

        if (!hasImages) {
          // Text-only response — return plain JSON array
          return JSON.stringify(results.map(({ text }) => JSON.parse(text)))
        }

        // Multimodal response — interleave photo info text + thumbnail image per photo
        const contentParts: any[] = []
        for (const { text, imageUrl, base64 } of results) {
          contentParts.push({ type: 'text', text })
          if (imageUrl) {
            // OpenAI: direct HTTPS URL — model fetches server-side
            contentParts.push({
              type: 'image_url',
              image_url: { url: imageUrl },
            })
          } else if (base64) {
            // Gemini: inline base64 data URI
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            })
          }
        }

        // Split text and image parts into separate sentinels.
        // For Gemini, images MUST NOT go in the ToolMessage (functionResponse)
        // because Gemini serialises functionResponse content as JSON text tokens,
        // not as native image tokens. Images will be injected as a separate
        // HumanMessage by executeToolCalls, where LangChain correctly converts
        // them to native inlineData parts.
        const textParts = contentParts.filter((p: any) => p.type === 'text')
        const imageParts = contentParts.filter((p: any) => p.type === 'image_url')
        return JSON.stringify({
          _multimodalContent: contentParts, // full content (used by OpenAI)
          _textContent: textParts, // text only (used by Gemini ToolMessage)
          _imageContent: imageParts, // images only (used by Gemini HumanMessage)
        })
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

    /** Semantic style search → returns all matching photo IDs (no limit). */
    const _getIdsByStyle = async (query: string): Promise<number[]> => {
      const result = await searchService.searchSemanticSync(query, userId, {
        searchMode: 'broad',
        pageSize: 500,
        iteration: 1,
        minMatchScore: 0.2,
        withInsights: false,
      })
      const raw = result.data.results[1] || []
      const photosArray = Array.isArray(raw) ? raw : []
      return photosArray.map((entry: any) => {
        const p = entry.photo ?? entry
        return p.id as number
      })
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
            const val = scores[sf.field]
            if (val === undefined) return false
            if (sf.min !== undefined && val < sf.min) return false
            if (sf.max !== undefined && val > sf.max) return false
          }
        }

        if (visualAspects) {
          for (const [key, accepted] of Object.entries(visualAspects)) {
            if (!accepted || accepted.length === 0) continue
            if (key === 'orientation') {
              const storedOrientation: string = (aspects['orientation'] as any) ?? ''
              let resolvedOrientation = storedOrientation.toLowerCase()
              if (!resolvedOrientation) {
                const exif = (photo.descriptions?.EXIF ?? {}) as Record<string, any>
                const w = exif.ImageWidth ?? exif.ExifImageWidth ?? 0
                const h = exif.ImageHeight ?? exif.ExifImageHeight ?? 0
                if (w > 0 && h > 0) {
                  resolvedOrientation = w > h ? 'landscape' : w < h ? 'portrait' : 'square'
                }
              }
              if (!resolvedOrientation) continue
              const matches = accepted.some((v) => v.toLowerCase() === resolvedOrientation)
              if (!matches) return false
              continue
            }
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
        filtered.sort((a, b) => {
          const aScore =
            ((a.descriptions?.artistic_scores as Record<string, number>) ?? {})[sortByScore] ?? -1
          const bScore =
            ((b.descriptions?.artistic_scores as Record<string, number>) ?? {})[sortByScore] ?? -1
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
          resultLength: 500,
        },
        userId
      )
      return results.map((p: any) => p.id as number)
    }

    // ── Tool: search_advanced ───────────────────────────────
    const searchAdvanced = tool(
      async ({
        operation,
        style_query,
        content_tags,
        filter,
        similar_to,
        limit = 20,
      }): Promise<string> => {
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
            return JSON.stringify({ totalFound: 0, operation, subSearches: subLabels, photos: [] })
          }

          // Sample to limit
          const clampedLimit = Math.min(Math.max(limit, 1), 50)
          const sampledIds = combinedIds.slice(0, clampedLimit)

          // Fetch full photo data for the sample
          const photos = await photoManager.getPhotosByIds(sampledIds)
          const photoMap = new Map(photos.map((p) => [p.id, p]))
          const formatted = sampledIds
            .map((id) => {
              const p = photoMap.get(id)
              if (!p) return null
              return photoDataForAgent(p)
            })
            .filter(Boolean)

          return JSON.stringify(
            {
              totalFound: combinedIds.length,
              operation,
              subSearches: subLabels,
              photos: formatted,
            },
            null,
            2
          )
        } catch (error) {
          return JSON.stringify({ error: `Advanced search failed: ${error.message}` })
        }
      },
      {
        name: 'search_advanced',
        description: TOOL_DESCRIPTIONS.search_advanced,
        schema: SearchAdvancedSchema,
      }
    )

    // ── Tool: overall_catalog_view ─────────────────────────
    const overallCatalogView = tool(
      async (): Promise<string> => {
        try {
          const statsService = new StatsService()

          const [catalogPatterns, visualAspectsStats, artisticScoresStats] = await Promise.all([
            User.find(userId).then((user) =>
              user
                ? formatCatalogPatternsForAgent(user.catalogPatterns, 'all')
                : JSON.stringify({ error: 'User not found' })
            ),
            statsService.getVisualAspectsStats(userId),
            statsService.getArtisticScoresStats(userId),
          ])

          const report = {
            catalog_patterns: JSON.parse(catalogPatterns),
            visual_aspects_stats: visualAspectsStats,
            artistic_scores_stats: artisticScoresStats,
          }

          return JSON.stringify(report, null, 2)
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
            return JSON.stringify(APP_KNOWLEDGE_SECTIONS, null, 2)
          }
          const key = section as AppKnowledgeSection
          return JSON.stringify({ section: key, content: APP_KNOWLEDGE_SECTIONS[key] }, null, 2)
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

          return JSON.stringify(
            {
              collections: collections.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                samplePhotoIds: c.photos.slice(0, 15).map((p) => p.id),
              })),
              series: series.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                samplePhotoIds: s.photos.slice(0, 15).map((p) => p.id),
              })),
            },
            null,
            2
          )
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

    return [getPhotoInfo, appKnowledge, searchAdvanced, fetchCollections, overallCatalogView]
  }
}
