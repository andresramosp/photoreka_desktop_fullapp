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
- If the user's message includes context photos (images shown before the text), those are the photos they are referring to. The basic info provided alongside each image covers visual_aspects, artistic_scores, and tags. Use get_photo_info only if you need deeper information (story, context, EXIF, visual accents, notes, etc.) about a specific photo.
- Whenever your response references a specific set of photos (a sequence, a selection, a ranking, a comparison, etc.), call add_photos_to_result with those photo IDs so they are returned to the client. Do this as part of the same turn, before or alongside your final answer.`

// ─────────────────────────────────────────────────────────────
// Tool schemas
// ─────────────────────────────────────────────────────────────

const GetPhotoInfoSchema = z.object({
  photoId: z.number().describe('The numeric ID of the photo to retrieve'),
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
  const tags =
    photo.tags?.map((t: any) => ({
      name: t.tag?.name || t.name,
      group: t.tag?.group || t.group,
      area: t.area,
      category: t.category,
    })) || []

  return JSON.stringify(
    {
      id: photo.id,
      originalFileName: photo.originalFileName,
      originalUrl: photo.originalUrl,
      thumbnailUrl: photo.thumbnailUrl,
      status: photo.status,
      createdAt: photo.createdAt,
      title: photo.title || null,
      // Narrative descriptions
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
      tags,
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
      artistic_scores: descriptions.artistic_scores || null,
      tags,
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
      async ({ photoId }): Promise<string> => {
        try {
          const photo = await photoManager.getPhoto(photoId.toString())
          if (!photo) return JSON.stringify({ error: `Photo ${photoId} not found` })
          return formatPhotoForAgent(photo)
        } catch (error) {
          return JSON.stringify({ error: `Photo not found or access denied: ${error.message}` })
        }
      },
      {
        name: 'get_photo_info',
        description:
          'Get full details of a specific photo by its ID. Returns all available data: artistic scores, narrative story, context, visual aspects (genre, composition, lighting, mood, color), visual accents, EXIF metadata, and all associated tags.',
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
          // collect found IDs into the turn-scoped array
          const raw = result.data.results[1] || []
          for (const entry of raw) {
            const id = (entry.photo ?? entry).id
            if (id != null && !foundPhotoIds.includes(id)) foundPhotoIds.push(id)
          }
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

    return [getPhotoInfo, getCatalogPatterns, searchSemantic, addPhotosToResult]
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

  public async chat(
    userId: number,
    message: string,
    contextPhotoIds: number[] = []
  ): Promise<AgentChatResult> {
    // Load history from in-memory store
    const history: ChatMessage[] = sessionHistories.get(userId) ?? []
    const model = createChatModel()

    const foundPhotoIds: number[] = []
    const tools = this.createTools(userId, foundPhotoIds)
    const modelWithTools = model.bindTools(tools)

    // Build message list: system + history + current message (optionally multimodal)
    const contextPhotos = await this.loadContextPhotos(userId, contextPhotoIds)

    let currentUserMessage: any
    if (contextPhotos.length > 0) {
      const provider = (process.env.AGENT_PROVIDER ?? 'openai') as ModelProvider

      // For Gemini, fetch thumbnails as base64 from R2 (Gemini does not support CDN URLs)
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

      // Compose a multimodal message: one image+info block per context photo, then the text
      const contentParts: any[] = [
        {
          type: 'text',
          text: `The user has provided ${contextPhotos.length} photo(s) as context for this message. Each photo is shown as a thumbnail followed by its basic metadata (visual_aspects, artistic_scores, tags). Use get_photo_info if you need deeper details about any of them.`,
        },
      ]

      for (const photo of contextPhotos) {
        const base64 = photoBase64Map.get(photo.id)
        if (base64) {
          contentParts.push(buildImagePartBase64(base64))
        } else {
          contentParts.push(buildImagePart(photo.thumbnailUrl))
        }
        contentParts.push({
          type: 'text',
          text: formatContextPhotoBasic(photo),
        })
      }

      contentParts.push({ type: 'text', text: message })
      currentUserMessage = new HumanMessage({ content: contentParts })
    } else {
      currentUserMessage = new HumanMessage(message)
    }

    // Find the photo IDs shown to the user in the most recent assistant turn
    const lastAssistantWithPhotos = [...history]
      .reverse()
      .find((m) => m.role === 'assistant' && m.photoIds && m.photoIds.length > 0)
    const sessionPhotoContext = lastAssistantWithPhotos
      ? `\n\nSession context: the photos most recently displayed to the user have IDs [${lastAssistantWithPhotos.photoIds!.join(', ')}]. If the user refers to "that photo", "those photos", or asks a follow-up about them, use these IDs directly with get_photo_info without asking the user.`
      : ''

    const messages: any[] = [
      new SystemMessage(SYSTEM_PROMPT + sessionPhotoContext),
      ...history
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))),
      currentUserMessage,
    ]

    // Build a tool lookup map for fast dispatch
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

    const toolsUsed: string[] = []
    const intermediateSteps: IntermediateStep[] = []
    const MAX_ITERATIONS = 6

    console.log(
      `\n[Agent] ▶ Starting | userId=${userId} | message="${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`
    )

    // Agentic loop: keep invoking until no more tool calls
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      console.log(`[Agent] 🔄 Iteration ${iter + 1}/${MAX_ITERATIONS} — calling model…`)
      const response = await modelWithTools.invoke(messages)
      messages.push(response)

      const toolCalls = response.tool_calls ?? []
      if (toolCalls.length === 0) {
        // No tool calls — final answer
        let output = extractTextContent(response.content)

        // If the model returned empty text after executing a side-effect-only tool
        // (e.g. add_photos_to_result), recover the text from the last AIMessage
        // that contained both tool calls and a text part.
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
        console.log(
          `[Agent] ✅ Final answer after ${iter + 1} iteration(s). Tools used: [${toolsUsed.join(', ') || 'none'}]`
        )
        console.log(
          `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"\n`
        )
        // Persist turn to in-memory history (only if we have a non-empty assistant reply
        // — empty strings cause API rejections on subsequent turns)
        if (output.trim().length > 0) {
          const updatedHistory = [
            ...history,
            { role: 'user' as const, content: message },
            { role: 'assistant' as const, content: output, photoIds: [...foundPhotoIds] },
          ]
          // Keep only the last MAX_HISTORY_TURNS pairs (2 messages per turn)
          sessionHistories.set(userId, updatedHistory.slice(-(MAX_HISTORY_TURNS * 2)))
        }
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

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolCalls.map(async (tc: any) => {
          const t = toolMap[tc.name]
          if (!toolsUsed.includes(tc.name)) toolsUsed.push(tc.name)

          console.log(
            `[Agent]   ⚙️  Calling tool "${tc.name}" with args: ${JSON.stringify(tc.args)}`
          )
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

          intermediateSteps.push({
            tool: tc.name,
            input: tc.args,
            output: result,
            durationMs,
          })

          return new ToolMessage({ content: result, tool_call_id: tc.id })
        })
      )

      messages.push(...toolResults)
    }

    // Reached max iterations — do one final call without tools to get a response
    console.log(
      `[Agent] ⚠️  Max iterations (${MAX_ITERATIONS}) reached. Requesting final response without tools…`
    )
    const finalModel = createChatModel()
    const finalResponse = await finalModel.invoke(messages)
    const output = extractTextContent(finalResponse.content)
    console.log(
      `[Agent] ✅ Final answer (max-iter fallback). Tools used: [${toolsUsed.join(', ')}]\n`
    )
    // Persist turn to in-memory history (max-iter fallback)
    if (output.trim().length > 0) {
      const updatedHistory = [
        ...history,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: output, photoIds: [...foundPhotoIds] },
      ]
      sessionHistories.set(userId, updatedHistory.slice(-(MAX_HISTORY_TURNS * 2)))
    }
    return {
      output,
      photoIds: foundPhotoIds,
      toolsUsed,
      intermediateSteps,
      totalIterations: MAX_ITERATIONS,
    }
  }
}
