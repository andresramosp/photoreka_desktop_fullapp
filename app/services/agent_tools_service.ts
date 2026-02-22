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
    originalUrl: photo.originalUrl ?? null,
    thumbnailUrl: photo.thumbnailUrl ?? null,
    createdAt: photo.createdAt,
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
// Tool descriptions (centralised)
// ─────────────────────────────────────────────────────────────

export const TOOL_DESCRIPTIONS = {
  get_photo_info:
    '[BASIC_TOOLS] Get full details and thumbnail image of one or more photos by their IDs. MUST be called before discussing, comparing, or operating on any photo — including photos the user has attached (prefixed as [Attached photo IDs: ...] in the message) and photos referenced from conversation history. Pass multiple IDs in a single call to batch-fetch. Returns full photo data (artistic scores, story, context, visual aspects, visual accents, EXIF, tags) plus the thumbnail image for visual analysis.',

  fetch_collections:
    "[BASIC_TOOLS] Get all the user's collections and series, each with their name, description, and up to 10 sample photo IDs. Use this when the user asks about their collections, series, albums, or organized groups of photos — for example 'what collections do I have?', 'show me my series', 'which albums exist?'. Returns two separate arrays: 'collections' (manually curated groups) and 'series' (ordered sequences/stories).",

  filter_photos:
    '[PHOTO_SEARCH] Filter and sort the user\'s photo catalog. All filter types can be freely combined. Available filters: (1) scoreFilters — numeric artistic scores 0–10: aesthetic_quality, composition, storytelling, strangeness, message, humor, visual_games, candidness (use with sortByScore + sortOrder to rank results). (2) visualAspects — categorical labels (OR within a key, AND across keys): genre: abstract|documentary|street|landscape|portrait; framing: close-up|medium shot|wide shot; focus: blurry|nitid; lighting: natural|artificial|backlit|frontlit|side lit; lighting_scheme: low key|high key|balanced; depth_of_field: shallow|deep|medium; perspective: normal|high angle|low angle; stylistic: long exposure|motion blur|silhouettes|bokeh|grain; orientation: portrait|landscape|square; temperature: warm|cold|neutral; palette: color|black and white. (3) dateFrom / dateTo — ISO 8601 date range (e.g. 2024-01-01). (4) filenameLike — substring match on filename. (5) limit — max results (default 20). Use this tool when the user asks things like "my funniest photos", "most surreal shot", "high visual games score", "close-up portraits", "landscape shots from 2024", "shallow depth of field", "vertical photos", "warm-toned", "black and white", "photos from last summer", "RAW files from March", etc. Returns matching photo IDs — include the relevant ones (drop results that don\'t match the user\'s intent) in your final answer\'s photo_ids.',

  search_semantic_overall_style:
    "[PHOTO_SEARCH] Search for photos by overall visual style, compositional feel, mood, color palette, or general atmosphere — broad semantic embedding search. Use this for open-ended style descriptions such as 'melancholic blue-toned street scenes' or 'minimalist high-key compositions'. Do NOT use for concrete subjects or narrative content — use search_semantic_content instead. Extract the query from user input but do not modify it or enrich it. Returns a ranked list of matching photo IDs — include the relevant ones (drop results that don't match the user's intent) in your final answer's photo_ids.",

  search_semantic_content:
    "[PHOTO_SEARCH] Search for photos containing specific subjects, narrative elements, or concrete content using 1 to 3 keyword tags (e.g. ['dog'], ['market', 'crowd'], ['child', 'bicycle']). Use this when the user is looking for photos of particular things, people, actions, or scenes — not for abstract style or mood queries (use search_semantic_overall_style for those). Returns a ranked list of matching photo IDs — include the relevant ones (drop results that don't match the user's intent) in your final answer's photo_ids.",

  find_photos_from_photo:
    "[PHOTO_SEARCH] Find photos visually or semantically similar to one or more reference photos (provided by their IDs). Use this tool whenever the user asks to find photos similar to a specific photo, or wants more photos like a given one. Choose the criteria based on the intent: use 'embedding' for overall visual likeness (default), 'story' for narrative similarity, 'context' for situational/environmental similarity, or 'chromatic' for color palette similarity. Returns a ranked list of matching photo IDs — include the relevant ones in your final answer's photo_ids.",

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

        // Wrap in a sentinel so executeToolCalls can build a multimodal ToolMessage
        return JSON.stringify({ _multimodalContent: contentParts })
      },
      {
        name: 'get_photo_info',
        description: TOOL_DESCRIPTIONS.get_photo_info,
        schema: GetPhotoInfoSchema,
      }
    )

    // ── Tool 2: search_semantic_overall_style ──────────────
    const searchSemanticOverallStyle = tool(
      async ({ query, pageSize = 20, minMatchScore, candidate_ids }): Promise<string> => {
        try {
          const clampedPageSize = 8 //Math.min(Math.max(pageSize, 1), 50)
          const result = await searchService.searchSemanticSync(query, userId, {
            searchMode: 'broad',
            pageSize: clampedPageSize,
            iteration: 1,
            minMatchScore: minMatchScore ?? 0.2,
            withInsights: false,
            ...(candidate_ids && candidate_ids.length > 0 ? { candidateIds: candidate_ids } : {}),
          })
          return formatSearchResultsForAgent(result)
        } catch (error) {
          return JSON.stringify({ error: `Search failed: ${error.message}` })
        }
      },
      {
        name: 'search_semantic_overall_style',
        description: TOOL_DESCRIPTIONS.search_semantic_overall_style,
        schema: SearchSemanticOverallStyleSchema,
      }
    )

    // ── Tool 3: search_semantic_content ───────────────────
    const searchSemanticContent = tool(
      async ({ tags, limit = 20, candidate_ids }): Promise<string> => {
        try {
          const scoringService = new ScoringService()
          const allPhotoIds = await photoManager.getPhotosIdsForSearch(userId.toString())
          const photoIds =
            candidate_ids && candidate_ids.length > 0
              ? allPhotoIds.filter((id) => (candidate_ids as number[]).includes(id))
              : allPhotoIds
          const scored = await scoringService.getScoredPhotosByTags(
            photoIds,
            tags,
            [],
            'adaptive',
            userId.toString()
          )

          if (!scored || scored.length === 0) {
            return JSON.stringify({ totalFound: 0, photos: [] })
          }

          const topScored = scored.slice(0, Math.min(limit, 50))
          const topIds = topScored.map((s) => s.id)
          const photos = await photoManager.getPhotosByIds(topIds)
          const photoMap = new Map(photos.map((p) => [p.id, p]))

          const formatted = topScored.map((s) => {
            const p = photoMap.get(s.id)
            if (!p) return { id: s.id, matchScore: s.totalScore }
            return photoDataForAgent(p, { matchScore: Math.round((s.totalScore ?? 0) * 100) / 100 })
          })

          return JSON.stringify({ totalFound: scored.length, photos: formatted }, null, 2)
        } catch (error) {
          return JSON.stringify({ error: `Content search failed: ${error.message}` })
        }
      },
      {
        name: 'search_semantic_content',
        description: TOOL_DESCRIPTIONS.search_semantic_content,
        schema: SearchSemanticContentSchema,
      }
    )

    // ── Tool 4: filter_photos ───────────────────────────────
    const filterPhotos = tool(
      async ({
        scoreFilters,
        sortByScore,
        sortOrder = 'desc',
        visualAspects,
        filenameLike,
        dateFrom,
        dateTo,
        limit = 20,
        candidate_ids,
      }): Promise<string> => {
        try {
          const photosQuery = Photo.query()
            .where('user_id', userId)
            .select('id', 'original_file_name', 'descriptions', 'created_at')
            .orderBy('created_at', 'desc')
          if (candidate_ids && candidate_ids.length > 0) {
            photosQuery.whereIn('id', candidate_ids)
          }
          const photos = await photosQuery

          const dateFromMs = dateFrom ? new Date(dateFrom).getTime() : null
          const dateToMs = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null

          let filtered = photos.filter((photo) => {
            const scores = (photo.descriptions?.artistic_scores ?? {}) as Record<string, number>
            const aspects = (photo.descriptions?.visual_aspects ?? {}) as Record<string, string[]>

            // ─ Score filters (AND)
            if (scoreFilters && scoreFilters.length > 0) {
              for (const sf of scoreFilters) {
                const val = scores[sf.field]
                if (val === undefined) return false
                if (sf.min !== undefined && val < sf.min) return false
                if (sf.max !== undefined && val > sf.max) return false
              }
            }

            // ─ Visual aspect filters (OR within key, AND across keys)
            if (visualAspects) {
              for (const [key, accepted] of Object.entries(visualAspects)) {
                if (!accepted || accepted.length === 0) continue

                // Orientation: resolve from visual_aspects or derive from EXIF dimensions
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
                  if (!resolvedOrientation) continue // no data — skip filter
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

            // ─ Filename filter
            if (filenameLike) {
              if (!photo.originalFileName.toLowerCase().includes(filenameLike.toLowerCase()))
                return false
            }

            // ─ Date range filter
            const createdMs = new Date(photo.createdAt.toString()).getTime()
            if (dateFromMs !== null && createdMs < dateFromMs) return false
            if (dateToMs !== null && createdMs > dateToMs) return false

            return true
          })

          // ─ Sorting
          if (sortByScore) {
            filtered.sort((a, b) => {
              const aScore =
                ((a.descriptions?.artistic_scores as Record<string, number>) ?? {})[sortByScore] ??
                -1
              const bScore =
                ((b.descriptions?.artistic_scores as Record<string, number>) ?? {})[sortByScore] ??
                -1
              return sortOrder === 'asc' ? aScore - bScore : bScore - aScore
            })
          } else if (sortOrder === 'asc') {
            filtered.reverse()
          }

          const limited = filtered.slice(0, Math.min(limit, 50))

          const formatted = limited.map((p) => photoDataForAgent(p))

          return JSON.stringify({ totalMatched: filtered.length, photos: formatted }, null, 2)
        } catch (error) {
          return JSON.stringify({ error: `Filter failed: ${error.message}` })
        }
      },
      {
        name: 'filter_photos',
        description: TOOL_DESCRIPTIONS.filter_photos,
        schema: FilterPhotosSchema,
      }
    )

    // ── Tool 5: find_photos_from_photo ──────────────────────
    const findPhotosFromPhoto = tool(
      async ({
        anchor_photo_ids,
        criteria,
        limit = 10,
        opposite = false,
        candidate_ids,
      }): Promise<string> => {
        try {
          const searchPhotoService = new SearchPhotoService()
          const results = await searchPhotoService.searchByPhotos(
            {
              anchorIds: anchor_photo_ids,
              currentPhotosIds: anchor_photo_ids,
              criteria,
              tagIds: [],
              boxesIds: [],
              descriptionCategories: [],
              opposite,
              inverted: false,
              resultLength: Math.min(limit, 50),
              ...(candidate_ids && candidate_ids.length > 0
                ? { candidatePoolIds: candidate_ids }
                : {}),
            },
            userId
          )

          const formatted = results.map((p: any) =>
            photoDataForAgent(p, {
              score: Math.round((p.score ?? 0) * 100) / 100,
              labelScore: p.labelScore,
            })
          )

          return JSON.stringify({ totalFound: formatted.length, photos: formatted }, null, 2)
        } catch (error) {
          return JSON.stringify({ error: `Similar photo search failed: ${error.message}` })
        }
      },
      {
        name: 'find_photos_from_photo',
        description: TOOL_DESCRIPTIONS.find_photos_from_photo,
        schema: FindPhotosFromPhotoSchema,
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
                samplePhotoIds: c.photos.slice(0, 10).map((p) => p.id),
              })),
              series: series.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                samplePhotoIds: s.photos.slice(0, 10).map((p) => p.id),
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

    return [
      getPhotoInfo,
      appKnowledge,
      searchSemanticOverallStyle,
      searchSemanticContent,
      findPhotosFromPhoto,
      filterPhotos,
      fetchCollections,
      overallCatalogView,
    ]
  }
}
