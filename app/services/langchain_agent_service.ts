// @ts-nocheck
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { tool } from '@langchain/core/tools'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import PhotoImageService from './photo_image_service.js'
import User from '#models/user'
import Photo from '#models/photo'

// ─────────────────────────────────────────────────────────────
// Model provider config
// ─────────────────────────────────────────────────────────────

type ModelProvider = 'openai' | 'gemini'

function createChatModel() {
  const provider = (process.env.AGENT_PROVIDER ?? 'openai') as ModelProvider
  if (provider === 'gemini') {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    })
  }
  return new ChatOpenAI({
    apiKey: process.env.OPENAI_KEY,
    model: process.env.OPENAI_MODEL ?? 'gpt-5',
  })
}

/** Builds an image content part for OpenAI (URL with detail hint).
 *  For Gemini, use buildImagePartBase64 instead — Gemini requires base64 data URIs. */
function buildImagePart(url: string): any {
  return { type: 'image_url', image_url: { url, detail: 'low' } }
}

/** Builds an image content part for Gemini using a base64 data URI. */
function buildImagePartBase64(base64: string): any {
  return { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
}

// ─────────────────────────────────────────────────────────────
// In-memory session store (userId → conversation history)
// ─────────────────────────────────────────────────────────────

const sessionHistories = new Map<number, ChatMessage[]>()
const MAX_HISTORY_TURNS = 5 // max user+assistant message pairs kept in memory

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  photoIds?: number[]
}

export type IntermediateStep = {
  tool: string
  input: Record<string, any>
  output: string
  durationMs: number
}

export type AgentChatResult = {
  output: string
  photoIds: number[]
  toolsUsed: string[]
  intermediateSteps: IntermediateStep[]
  totalIterations: number
}

// ─────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Photoreka's intelligent photo catalog assistant. 
You help photographers explore, understand, and get insights from their photo library.

Guidelines:
- You can chain multiple tools in one turn when it helps answer the question better.
- Be concise, specific and helpful. Summarize key data rather than dumping raw JSON.
- If you need to reference a concrete photo by text, you can use the filename, never the ID.
- Artistic scores are from 0 to 10. Scores >= 7 are considered strong. Use scores for your internal reasoning, but do not mention them unless they are relevant to the user's question.
- Always respond in the same language the user writes in (but for some tools you will need english prompts — that's fine, just keep the final output in the user's language).
- If the user's message includes context photos (images shown before the text), those are the photos they are referring to. The basic info provided alongside each image covers visual_aspects, artistic_scores, and tags. Use get_photo_info only if you need deeper information (story, context, EXIF, visual accents, notes, etc.) about specific photos — pass all needed IDs in a single call.
- After calling search_semantic or filter_photos, you MUST always call add_photos_to_result with the final curated set of IDs before giving your answer. Only include photos you are actually referencing in your response — drop any results that don't match the user's intent (wrong subject, irrelevant, etc.). This is the only way photos reach the client; if you skip this call, no photos will be shown.
- When the user asks to find photos by specific properties (scores, visual style, orientation, date, filename), prefer filter_photos over search_semantic. Use search_semantic only for open-ended natural language descriptions.`

// ─────────────────────────────────────────────────────────────
// Tool schemas
// ─────────────────────────────────────────────────────────────

const GetPhotoInfoSchema = z.object({
  photoIds: z
    .array(z.number())
    .describe(
      'One or more numeric photo IDs to retrieve. Pass multiple IDs to batch-fetch in a single call.'
    ),
})

const GetCatalogPatternsSchema = z.object({
  reviewType: z
    .enum(['general', 'story', 'context', 'visual_accents', 'all'])
    .optional()
    .default('all')
    .describe(
      'Which pattern category to retrieve: general (stylistic/object motif patterns), story (narrative patterns), context (contextual patterns), visual_accents (visual accent patterns), or all (default)'
    ),
})

const AddPhotosToResultSchema = z.object({
  photoIds: z
    .array(z.number())
    .describe(
      'Ordered array of photo IDs to return to the client. The position in the array defines the display order (index 0 = first). When you want to express a sequence, ranking, or curated order, arrange the IDs accordingly.'
    ),
})

const ScoreField = z.enum([
  'aesthetic_quality',
  'composition',
  'storytelling',
  'strangeness',
  'message',
  'humor',
  'visual_games',
  'candidness',
])

const FilterPhotosSchema = z.object({
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
      'Filter by artistic score fields. Multiple entries are ANDed. Omit to skip score filtering.'
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
    })
    .optional()
    .describe(
      'Filter by visual aspect values. Each key accepts an array of valid values; a photo must match at least one value per specified key (OR within a key, AND across keys). Accepted values per key — genre: abstract|documentary|street|landscape|portrait; framing: close-up|medium shot|wide shot; focus: blurry|nitid; lighting: natural|artificial|backlit|frontlit|side lit; lighting_scheme: low key|high key|balanced; depth_of_field: shallow|deep|medium; perspective: normal|high angle|low angle; stylistic: long exposure|motion blur|silhouettes|bokeh|grain.'
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
})

const SearchSemanticSchema = z.object({
  query: z
    .string()
    .describe(
      'Natural language description of the photos to find. Be descriptive — include mood, subject, composition, light, color, context, etc. Always in english, regardless of user language.'
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
})

// ─────────────────────────────────────────────────────────────
// Helper: format photo for agent output
// ─────────────────────────────────────────────────────────────

function formatPhotoForAgent(photo: any): string {
  const descriptions = photo.descriptions || {}

  return JSON.stringify(
    {
      id: photo.id,
      originalFileName: photo.originalFileName,
      originalUrl: photo.originalUrl,
      thumbnailUrl: photo.thumbnailUrl,
      createdAt: photo.createdAt,
      story: descriptions.story || null,
      context: descriptions.context || null,
      visual_accents: descriptions.visual_accents || null,
      // Visual analysis
      visual_aspects: descriptions.visual_aspects || null,
      // Artistic scores (0–10)
      artistic_scores: descriptions.artistic_scores || null,
      // Technical metadata
      exif: descriptions.EXIF || null,
      // Tags
      // Analysis notes
      notes: descriptions.notes || null,
    },
    null,
    2
  )
}

// ─────────────────────────────────────────────────────────────
// Helper: format search results for agent output
// ─────────────────────────────────────────────────────────────

function formatSearchResultsForAgent(result: any): string {
  const raw = result.data.results[1] || []
  const photosArray = Array.isArray(raw) ? raw : []

  const formatted = photosArray.slice(0, 50).map((entry: any) => {
    // getPaginatedPhotosByCursor wraps each photo under a `.photo` key
    const p = entry.photo ?? entry
    const matchScore = p.matchScore !== undefined ? Math.round(p.matchScore * 100) / 100 : undefined
    return {
      id: p.id,
      originalFileName: p.originalFileName,
      matchScore,
      story: p.descriptions?.story || null,
      context: p.descriptions?.context || null,
      artistic_scores: p.descriptions?.artistic_scores || null,
      visual_aspects: p.descriptions?.visual_aspects
        ? {
            genre: p.descriptions.visual_aspects.genre,
            subject: p.descriptions.visual_aspects.subject,
            mood: p.descriptions.visual_aspects.mood,
          }
        : null,
    }
  })

  return JSON.stringify(
    {
      totalFound: photosArray.length,
      photos: formatted,
    },
    null,
    2
  )
}

// ─────────────────────────────────────────────────────────────
// Helper: format context photo (minimal — thumbnail already sent as image)
// ─────────────────────────────────────────────────────────────

function formatContextPhotoBasic(photo: any): string {
  const descriptions = photo.descriptions || {}
  const tags =
    photo.tags?.map((t: any) => ({
      name: t.tag?.name || t.name,
      group: t.tag?.group || t.group,
    })) || []

  return JSON.stringify(
    {
      id: photo.id,
      originalFileName: photo.originalFileName,
      visual_aspects: descriptions.visual_aspects || null,
      // artistic_scores: descriptions.artistic_scores || null,
      // context: descriptions.context || null,
      // story: descriptions.story || null,
      // visual_accents: descriptions.visual_accents || null,
    },
    null,
    2
  )
}

// ─────────────────────────────────────────────────────────────
// Helper: format catalog patterns for agent output
// ─────────────────────────────────────────────────────────────

function formatCatalogPatternsForAgent(catalogPatterns: any, reviewType: string): string {
  if (!catalogPatterns) {
    return JSON.stringify({
      error: 'No catalog patterns available. The catalog may not have been analyzed yet.',
    })
  }

  const { metadata: _omit, ...patternData } = catalogPatterns

  const stripClusterPhotos = (patterns: any) => {
    if (!Array.isArray(patterns)) return patterns
    return patterns.map(({ clusterPhotos: _omit, ...rest }: any) => rest)
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
// Helper: format messages array for human-readable debug logging
// ─────────────────────────────────────────────────────────────

function formatMessagesForDebug(messages: any[]): string {
  const lines: string[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const type: string = msg._getType?.() ?? msg.constructor?.name ?? 'unknown'

    let role: string
    if (type === 'system') role = 'SYSTEM'
    else if (type === 'human') role = 'USER'
    else if (type === 'ai') role = 'ASSISTANT'
    else if (type === 'tool') role = `TOOL(${msg.name ?? msg.tool_call_id ?? '?'})`
    else role = type.toUpperCase()

    // Resolve content to a readable string
    let content: string
    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((p: any) => {
          if (p?.type === 'text') return p.text
          if (p?.type === 'image_url') return `[image: ${p.image_url?.url?.slice(0, 60)}…]`
          return JSON.stringify(p)
        })
        .join('\n')
    } else {
      content = JSON.stringify(msg.content)
    }

    // Append tool_calls summary for assistant messages
    const toolCalls = msg.tool_calls ?? []
    const toolCallSummary =
      toolCalls.length > 0
        ? '\n  → tool_calls: ' +
          toolCalls.map((tc: any) => `${tc.name}(${JSON.stringify(tc.args)})`).join(', ')
        : ''

    lines.push(`[${i}] ${role}:\n${content}${toolCallSummary}`)
    lines.push('─'.repeat(60))
  }
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────
// Helper: extract plain text from a model response's content
// (content can be a string or an array of content parts)
// ─────────────────────────────────────────────────────────────

function extractTextContent(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('')
  }
  return ''
}

// ─────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────

export default class LangchainAgentService {
  private photoManager: PhotoManager
  private searchService: SearchTextService

  constructor() {
    this.photoManager = new PhotoManager()
    this.searchService = new SearchTextService()
  }

  // ───────────────────────────────────────────────────────────
  // Tool factory — bound to a specific userId
  // ───────────────────────────────────────────────────────────

  private createTools(userId: number, foundPhotoIds: number[]) {
    const photoManager = this.photoManager
    const searchService = this.searchService

    // ── Tool 1: get_photo_info ──────────────────────────────
    const getPhotoInfo = tool(
      async ({ photoIds: ids }): Promise<string> => {
        const results = await Promise.all(
          ids.map(async (photoId: number) => {
            try {
              const photo = await photoManager.getPhoto(photoId.toString())
              if (!photo) return { photoId, error: `Photo ${photoId} not found` }
              return JSON.parse(formatPhotoForAgent(photo))
            } catch (error) {
              return { photoId, error: `Photo not found or access denied: ${error.message}` }
            }
          })
        )
        return JSON.stringify(ids.length === 1 ? results[0] : results, null, 2)
      },
      {
        name: 'get_photo_info',
        description:
          'Get full details of one or more photos by their IDs. Pass multiple IDs in a single call to batch-fetch. Returns all available data per photo: artistic scores, narrative story, context, visual aspects (genre, composition, lighting, mood, color), visual accents, EXIF metadata, and all associated tags.',
        schema: GetPhotoInfoSchema,
      }
    )

    // ── Tool 2: get_catalog_patterns ────────────────────────
    const getCatalogPatterns = tool(
      async ({ reviewType = 'all' }): Promise<string> => {
        try {
          const user = await User.find(userId)
          if (!user) return JSON.stringify({ error: 'User not found' })
          return formatCatalogPatternsForAgent(user.catalogPatterns, reviewType)
        } catch (error) {
          return JSON.stringify({ error: `Failed to retrieve catalog patterns: ${error.message}` })
        }
      },
      {
        name: 'get_catalog_patterns',
        description:
          "Get the photographer's catalog patterns — AI-detected recurring themes, stylistic tendencies, dominant subjects, narrative patterns, and visual motifs across the entire catalog. Use this when the user asks about their photographic style, strengths, recurring subjects, or catalog overview.",
        schema: GetCatalogPatternsSchema,
      }
    )

    // ── Tool 3: search_semantic ─────────────────────────────
    const searchSemantic = tool(
      async ({ query, pageSize = 20, minMatchScore }): Promise<string> => {
        try {
          const clampedPageSize = 5 //Math.min(Math.max(pageSize, 1), 50)
          const result = await searchService.searchSemanticSync(query, userId, {
            searchMode: 'broad',
            pageSize: clampedPageSize,
            iteration: 1,
            minMatchScore: minMatchScore ?? 0.2,
            withInsights: false,
          })
          return formatSearchResultsForAgent(result)
        } catch (error) {
          return JSON.stringify({ error: `Search failed: ${error.message}` })
        }
      },
      {
        name: 'search_semantic',
        description:
          'Search for photos using a natural language description in broad mode — retrieves a wide range of photos semantically matching the description. Use this when the user wants to find photos based on natural language. Extract the query from user input but do not modify it or enrich it.',
        schema: SearchSemanticSchema,
      }
    )

    // ── Tool 4: add_photos_to_result ────────────────────────
    const addPhotosToResult = tool(
      async ({ photoIds: ids }): Promise<string> => {
        // Replace foundPhotoIds with the explicitly ordered list so the caller's
        // ordering is authoritative (overrides any IDs previously added by search).
        foundPhotoIds.length = 0
        for (const id of ids) {
          if (!foundPhotoIds.includes(id)) foundPhotoIds.push(id)
        }
        return JSON.stringify({ ordered: foundPhotoIds, total: foundPhotoIds.length })
      },
      {
        name: 'add_photos_to_result',
        description:
          'Set the ordered list of photo IDs that will be returned to the client. The position in the array defines display order (index 0 = first). Call this whenever your response is centred on a specific set of photos — a proposed sequence, a ranking, a curated selection, a comparison — and arrange the IDs in the intended order. This call is authoritative and replaces any previously registered IDs.',
        schema: AddPhotosToResultSchema,
      }
    )

    // ── Tool 5: filter_photos ───────────────────────────────
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
      }): Promise<string> => {
        try {
          // Lightweight query — only the columns we need for filtering
          const photos = await Photo.query()
            .where('user_id', userId)
            .select(
              'id',
              'original_file_name',
              // 'thumbnail_url',
              // 'original_url',
              'descriptions',
              'created_at'
            )
            .orderBy('created_at', 'desc')

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
            // Default sort is desc by createdAt from query; reverse if asc requested
            filtered.reverse()
          }

          const limited = filtered.slice(0, Math.min(limit, 50))

          const formatted = limited.map((p) => ({
            id: p.id,
            originalFileName: p.originalFileName,
            artistic_scores: p.descriptions?.artistic_scores ?? null,
            visual_aspects: p.descriptions?.visual_aspects ?? null,
            createdAt: p.createdAt,
          }))

          return JSON.stringify({ totalMatched: filtered.length, photos: formatted }, null, 2)
        } catch (error) {
          return JSON.stringify({ error: `Filter failed: ${error.message}` })
        }
      },
      {
        name: 'filter_photos',
        description:
          'Filter and sort the user\'s photo catalog by structured properties: artistic scores (aesthetic_quality, composition, storytelling, strangeness, message, humor, visual_games, candidness), visual aspects (genre, framing, focus, lighting, depth of field, perspective, stylistic), filename, and date range. Use this instead of semantic search when the user asks questions like "my funniest photo", "most surreal shot", "close-up portraits", "landscape shots from 2024", "photos with shallow depth of field", etc. Score fields meaning — aesthetic_quality: visual beauty; composition: frame balance and harmony; storytelling: narrative power of characters/gestures; strangeness: mysterious or surreal quality; message: social or symbolic statement; humor: funny or ironic element; visual_games: illusions, reflections, paradoxes; candidness: spontaneity and naturalness.',
        schema: FilterPhotosSchema,
      }
    )

    return [getPhotoInfo, getCatalogPatterns, searchSemantic, addPhotosToResult, filterPhotos]
  }

  // ───────────────────────────────────────────────────────────
  // Main chat method — manual tool-calling loop (LangChain v1.x)
  // ───────────────────────────────────────────────────────────

  /** Clears the in-memory conversation history for a user. */
  public static clearHistory(userId: number): void {
    sessionHistories.delete(userId)
  }

  // ───────────────────────────────────────────────────────────
  // Load context photos (thumbnail + basic descriptions + tags)
  // owned by userId; silently ignores unknown / foreign IDs
  // ───────────────────────────────────────────────────────────

  private async loadContextPhotos(userId: number, photoIds: number[]): Promise<any[]> {
    if (!photoIds || photoIds.length === 0) return []
    return Photo.query()
      .whereIn('id', photoIds.slice(0, 10))
      .where('userId', userId)
      .preload('tags', (q) => q.preload('tag' as any))
  }

  // ───────────────────────────────────────────────────────────
  // Builds the HumanMessage for the current turn.
  // If context photos are provided, composes a multimodal message with
  // thumbnails + basic metadata for each photo, followed by the user text.
  // ───────────────────────────────────────────────────────────

  private async buildCurrentUserMessage(
    userId: number,
    message: string,
    contextPhotos: any[]
  ): Promise<HumanMessage> {
    if (contextPhotos.length === 0) {
      return new HumanMessage(message)
    }

    const provider = (process.env.AGENT_PROVIDER ?? 'openai') as ModelProvider

    // Gemini requires base64 data URIs — fetch thumbnails from R2
    const photoBase64Map = new Map<number, string>()
    if (provider === 'gemini') {
      const photoImageService = PhotoImageService.getInstance()
      const validImages = await photoImageService.getValidPhotosWithImagesThumb(
        contextPhotos as any[],
        false
      )
      for (const vi of validImages) {
        photoBase64Map.set(vi.photo.id, vi.base64 as string)
      }
    }

    const contentParts: any[] = [
      {
        type: 'text',
        text: `The user has provided ${contextPhotos.length} photo(s) as context for this message. Each photo is shown as a thumbnail followed by its basic metadata (visual_aspects, artistic_scores, tags). Use get_photo_info if you need deeper details about any of them.`,
      },
    ]

    for (const photo of contextPhotos) {
      const base64 = photoBase64Map.get(photo.id)
      contentParts.push(base64 ? buildImagePartBase64(base64) : buildImagePart(photo.thumbnailUrl))
      contentParts.push({ type: 'text', text: formatContextPhotoBasic(photo) })
    }

    contentParts.push({ type: 'text', text: message })
    return new HumanMessage({ content: contentParts })
  }

  // ───────────────────────────────────────────────────────────
  // Builds the full messages array: system prompt + hydrated history + current turn.
  // ───────────────────────────────────────────────────────────

  private buildMessageList(history: ChatMessage[], currentUserMessage: HumanMessage): any[] {
    return [
      new SystemMessage(SYSTEM_PROMPT),
      ...history
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => {
          const photoSuffix =
            m.photoIds && m.photoIds.length > 0 ? `\n[Photo IDs: ${m.photoIds.join(', ')}]` : ''
          const content = m.content + photoSuffix
          return m.role === 'user' ? new HumanMessage(content) : new AIMessage(content)
        }),
      currentUserMessage,
    ]
  }

  // ───────────────────────────────────────────────────────────
  // Resolves the final text output from a model response.
  // If the response is empty (e.g. after a side-effect-only tool call like
  // add_photos_to_result), walks back through messages to find the last
  // non-empty AIMessage text.
  // ───────────────────────────────────────────────────────────

  private resolveOutput(response: any, messages: any[]): string {
    let output = extractTextContent(response.content)
    if (!output.trim()) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg instanceof AIMessage) {
          const candidate = extractTextContent(msg.content)
          if (candidate.trim()) {
            output = candidate
            break
          }
        }
      }
    }
    return output
  }

  // ───────────────────────────────────────────────────────────
  // Executes all tool calls from one model iteration in parallel.
  // Returns an array of ToolMessages to append to the conversation.
  // ───────────────────────────────────────────────────────────

  private async executeToolCalls(
    toolCalls: any[],
    toolMap: Record<string, any>,
    toolsUsed: string[],
    intermediateSteps: IntermediateStep[]
  ): Promise<ToolMessage[]> {
    return Promise.all(
      toolCalls.map(async (tc: any) => {
        const t = toolMap[tc.name]
        if (!toolsUsed.includes(tc.name)) toolsUsed.push(tc.name)

        console.log(`[Agent]   ⚙️  Calling tool "${tc.name}" with args: ${JSON.stringify(tc.args)}`)
        const t0 = Date.now()

        let result: string
        if (t) {
          try {
            result = await t.invoke(tc.args)
          } catch (err) {
            result = JSON.stringify({ error: `Tool execution failed: ${err.message}` })
          }
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${tc.name}` })
        }

        const durationMs = Date.now() - t0
        console.log(
          `[Agent]   ✔️  Tool "${tc.name}" returned in ${durationMs}ms. Preview: ${result.slice(0, 150)}${result.length > 150 ? '…' : ''}`
        )

        intermediateSteps.push({ tool: tc.name, input: tc.args, output: result, durationMs })

        return new ToolMessage({ content: result, tool_call_id: tc.id })
      })
    )
  }

  // ───────────────────────────────────────────────────────────
  // Persists a completed turn (user + assistant messages) to the in-memory
  // history, capped at MAX_HISTORY_TURNS pairs. No-ops on empty output.
  // ───────────────────────────────────────────────────────────

  private persistHistory(
    userId: number,
    history: ChatMessage[],
    message: string,
    contextPhotoIds: number[],
    output: string,
    foundPhotoIds: number[]
  ): void {
    if (!output.trim()) return
    const updatedHistory = [
      ...history,
      {
        role: 'user' as const,
        content: message,
        photoIds: contextPhotoIds.length > 0 ? contextPhotoIds : undefined,
      },
      { role: 'assistant' as const, content: output, photoIds: [...foundPhotoIds] },
    ]
    sessionHistories.set(userId, updatedHistory.slice(-(MAX_HISTORY_TURNS * 2)))
  }

  // ───────────────────────────────────────────────────────────
  // Main chat method — manual tool-calling loop (LangChain v1.x)
  // ───────────────────────────────────────────────────────────

  public async chat(
    userId: number,
    message: string,
    contextPhotoIds: number[] = []
  ): Promise<AgentChatResult> {
    const history: ChatMessage[] = sessionHistories.get(userId) ?? []
    const foundPhotoIds: number[] = []
    const tools = this.createTools(userId, foundPhotoIds)
    const modelWithTools = createChatModel().bindTools(tools)
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

    const contextPhotos = await this.loadContextPhotos(userId, contextPhotoIds)
    const currentUserMessage = await this.buildCurrentUserMessage(userId, message, contextPhotos)
    const messages = this.buildMessageList(history, currentUserMessage)

    const toolsUsed: string[] = []
    const intermediateSteps: IntermediateStep[] = []
    const MAX_ITERATIONS = 5

    console.log(
      `\n[Agent] ▶ Starting | userId=${userId} | message="${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`
    )

    // Agentic loop: keep invoking until no more tool calls
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      console.log(`[Agent] 🔄 Iteration ${iter + 1}/${MAX_ITERATIONS} — calling model…`)
      const debugMessages = formatMessagesForDebug(messages)
      // console.log(
      //   `[Agent] 📨 Messages sent to model (iter ${iter + 1}):\n${'═'.repeat(60)}\n${debugMessages}`
      // )

      const response = await modelWithTools.invoke(messages)
      messages.push(response)

      const toolCalls = response.tool_calls ?? []

      if (toolCalls.length === 0) {
        const output = this.resolveOutput(response, messages)
        console.log(
          `[Agent] ✅ Final answer after ${iter + 1} iteration(s). Tools used: [${toolsUsed.join(', ') || 'none'}]`
        )
        console.log(
          `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"\n`
        )
        this.persistHistory(userId, history, message, contextPhotoIds, output, foundPhotoIds)
        return {
          output,
          photoIds: foundPhotoIds,
          toolsUsed,
          intermediateSteps,
          totalIterations: iter + 1,
        }
      }

      console.log(
        `[Agent] 🔧 Tool calls requested (${toolCalls.length}): ${toolCalls.map((tc: any) => tc.name).join(', ')}`
      )
      const toolResults = await this.executeToolCalls(
        toolCalls,
        toolMap,
        toolsUsed,
        intermediateSteps
      )
      messages.push(...toolResults)
    }

    // Reached max iterations — do one final call without tools to get a response
    console.log(
      `[Agent] ⚠️  Max iterations (${MAX_ITERATIONS}) reached. Requesting final response without tools…`
    )
    const finalResponse = await createChatModel().invoke(messages)
    const output = extractTextContent(finalResponse.content)
    console.log(
      `[Agent] ✅ Final answer (max-iter fallback). Tools used: [${toolsUsed.join(', ')}]\n`
    )
    this.persistHistory(userId, history, message, contextPhotoIds, output, foundPhotoIds)
    return {
      output,
      photoIds: foundPhotoIds,
      toolsUsed,
      intermediateSteps,
      totalIterations: MAX_ITERATIONS,
    }
  }
}
