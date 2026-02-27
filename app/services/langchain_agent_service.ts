import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService, {
  photoDataForAgentPreview,
  photoDataForAgentRich,
} from './agent_tools_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import PhotoImageService from './photo_image_service.js'
import redis from '@adonisjs/redis/services/main'
import {
  _debug,
  compactPreview,
  makeDebugCallback,
  makeUsageCallback,
} from '../utils/agent_utils.js'

// ══════════════════════════════════════════════════════════════
// PROMPTS & SCHEMA
// ══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT_BASE = `You are Photoreka's intelligent photo assistant.
Help photographers explore and analyze their library with insight and wit.

## Behavior
- **Language:** Always match the user's language. Use English only for internal tool calls.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Stealth:** Never mention tool names or internal IDs to the user.`

const PHASE1_ROLE_ADDENDUM = `

## Your current role: DATA COLLECTOR
You are in the data-gathering phase. Your ONLY job is to call the right tools to fetch the data the user needs.
- **DO NOT** compose a response, summary, or evaluation of the results.
- **DO NOT** assess whether search results are "good enough" qualitatively — a later phase with visual access to thumbnails handles that.
- **DO re-search** ONLY if there is a clear quantitative gap (e.g. user asked for 5 photos and you got 2).
- When you have all the data you need, call the \`done\` tool to signal completion. You MUST always end by calling \`done\`.

## Search & Tool Strategy
- **Parallelism:** Call independent (and different) tools simultaneously in one step.
- **Advanced Search (\`search_advanced\`):**
    - Use for targeted photo searches with specific criteria.
    - Use \`style_query\` for visual style queries (e.g. "dark moody portraits", "high-key minimalism").
    - Use \`content_tags\` for concrete objects/actions/events.
    - Use \`filter\` for metadata, scores, visual aspects, dates.
    - Use \`similar_to\` for finding photos similar to reference photo/s.
    - **Logic:** Use \`intersect\` (AND) for specific requests; \`union\` (OR) for broad inspiration.
    - **Fallback:** If a strict search yields 0 results, retry with another tool/parameter.
    - **NEVER** call simultaneously more than ONE \`search_advanced\` in the same step — combine criteria within a single call, using intersect/union logic.
- **Catalog Exploration (\`catalog_sample\`):**
    - Use for evolution, progress-over-time, or broad catalog cross-section questions.
    - NEVER use \`search_advanced\` for these — \`catalog_sample\` is the right tool.
    - Always call \`catalog_sample\` + \`overall_catalog_view\` in parallel.
    - Use the \`genre\` filter to narrow to a specific genre (e.g. street photography evolution).
- **Photo Context (CRITICAL):**
    - Call \`get_photo_info\` ONLY for:
        1. Photo IDs attached by the user in the current message (these are auto-prefetched, so you rarely need to call it yourself).
        2. Photo IDs referenced from conversation history that you need to discuss again.
    - **NEVER** call \`get_photo_info\` on photos returned by \`search_advanced\` or \`catalog_sample\` — a later phase automatically injects full descriptions and thumbnail images for visual evaluation.
    - Full metadata and thumbnail images are injected automatically before your final answer — do NOT call any tool again to get more detail.

## Curatorial data strategy
For questions about critique, evaluation, portfolio review, or photo culling:
- Call \`overall_catalog_view\` to retrieve the user's catalog-level patterns, style profile, and cluster analysis. This is essential context for any evaluative question.
- Call \`search_advanced\` OR \`catalog_sample\` to find the specific photos relevant to the query. 
- Do NOT attempt to evaluate or score the photos yourself — just gather the data.

## Catalog exploration & evolution questions
For questions about photographic evolution, progress over time, or broad catalog sampling:
- Call \`overall_catalog_view\` AND \`catalog_sample\` in parallel — always both together.
- \`catalog_sample\` returns structured buckets with date ranges and sampled photos per period — use it for temporal cross-sections.
- Use the \`genre\` filter in \`catalog_sample\` to narrow to specific genres (e.g. street photography evolution).
- Do NOT use \`search_advanced\` for exploration/evolution questions — \`catalog_sample\` is the dedicated tool for that.`

const PHASE2_ROLE_ADDENDUM = `

## Your current role: CURATOR & JUDGE
You have all gathered data from previous steps. You also have visual access to thumbnail images paired with full descriptions for the user's attached photos and top search results. Use them for visual verification and curatorial judgment.

Photos may arrive with thumbnails (for visual evaluation) or text-only descriptions (from earlier search iterations). Both are valid candidates for your response.

## Curatorial judgment
- **Selectivity:** Only include photos that genuinely match the user's request. Discard tangential or low-relevance results — even if returned by a search tool.
- **Scoring (1-10):** Use for internal ranking. Surface scores only if the user asks or it adds clear value.
    - *Scale:* 1 (Disastrous), 5 (Acceptable), 7.5 (Remarkable), 10 (Unique).
- **Genre-specific priorities** — weight criteria by the photographer's style:
    - *Documentary:* \`message\`, \`storytelling\`, \`candidness\`.
    - *Street:* \`candidness\`, \`visual_games\`, \`originality\`.
    - *Artistic:* \`message\`, \`originality\`, \`composition\`.
- **Catalog analysis:** Look for patterns and imbalances across clusters, not just average scores.

## Communication
- **Conciseness:** Max 200 words. No fluff, no raw JSON. Summarize insights unless explicitly asked for details.
- **Paragraphs:** Split the \`text\` field into short, distinct paragraphs (2–4 sentences each). Never a single continuous block. Each paragraph = one idea: overall impression → highlights → weakness/suggestion.
- **Proactivity:** Suggest 1 concrete next step the user can take within the app.
- **Honesty:** Be honest, constructive, and insightful — even if that means tough feedback.
- **Formatting:** Use **bold** for filenames, key concepts, and any term worth emphasizing. Use it sparingly — only for genuinely important words, not decoration.
- Use filenames for reference in your text, never raw IDs or tool names.

## Visual Output — photo_groups
- Populate \`photo_groups\` when the user expects visual results (rankings, selections, or sets).
- SINGLE group labeled \`"result"\` for flat lists with no natural subdivision.
- MULTIPLE groups for thematic/temporal/categorical separation (e.g. \`"Portraits"\`, \`"Landscapes"\`, \`"Top picks"\`, \`"Honorable mentions"\`).
- Group labels: in the user's language, concise.
- Order within each group IS your editorial statement (index 0 = most prominent).
- No cost or limit to including photo IDs — include every pertinent photo. Be generous.
- Leave empty only when no specific photos are relevant.`

const PHASE2_TRIGGER = `Now produce your final response to the user.
Use the thumbnails and descriptions provided for visual verification.
Act as a discerning curator: discard tangential results, keep only what genuinely matches.
Text-only described photos (from earlier iterations) are also valid candidates for photo_groups.`

const FINAL_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The complete response text to show to the user.',
    },
    photo_groups: {
      type: 'array',
      description:
        'Grouped photo results. Each group has a label and an ordered list of photo IDs. ' +
        'Empty array if no photos are relevant.',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Short group name (e.g. "result", "Portraits", "Landscapes").',
          },
          photo_ids: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Ordered photo IDs for this group.',
          },
        },
        required: ['label', 'photo_ids'],
      },
    },
  },
  required: ['text', 'photo_groups'],
} as const

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export type TokenUsageEntry = {
  label: string
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  totalTokens: number
  costEur: number
}

export type AgentCostBreakdown = {
  iterations: TokenUsageEntry[]
  phase2: TokenUsageEntry
  total: TokenUsageEntry
}

export type PhotoGroup = {
  label: string
  photoIds: number[]
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  photoIds?: number[]
  photoGroups?: PhotoGroup[]
}

export type IntermediateStep = {
  tool: string
  input: Record<string, any>
  output: string
  durationMs: number
}

export type AgentChatResult = {
  output: string
  photoGroups: PhotoGroup[]
  toolsUsed: string[]
  intermediateSteps: IntermediateStep[]
  totalIterations: number
  cost: AgentCostBreakdown
}

type ModelName = string
type ModelProvider = 'openai' | 'gemini'

type PhotoIdGroup = {
  tool: string
  ids: number[]
  stepIndex: number
}

type ChatSession = {
  userId: number
  message: string
  history: ChatMessage[]
  modelName: ModelName
  provider: ModelProvider
  modelNamePhase2: ModelName
  providerPhase2: ModelProvider
  userContext: string
  messages: any[]
  toolMap: Record<string, any>
  modelWithTools: any
  foundPhotoIds: number[]
  toolsUsed: string[]
  intermediateSteps: IntermediateStep[]
  iterationUsages: TokenUsageEntry[]
  totalIter: number
}

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const MAX_HISTORY_TURNS = 4
const HISTORY_TTL_SECONDS = 7200
const PHASE2_MAX_PHOTOS = 80 // total photos sent to the model (with or without thumbnail)
const PHASE2_MAX_THUMBNAILS = 20 // how many of those can carry a thumbnail image
// → the remaining (PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS = 60) are text-only

/** Tools whose Phase 2 photo results are eligible for thumbnail images. */
const IMAGE_ELIGIBLE_TOOLS = new Set(['search_advanced', 'get_photo_info', 'fetch_collections'])

const NON_PHOTO_TOOLS = new Set(['overall_catalog_view', 'app_knowledge', 'catalog_sample', 'done'])

const DEFAULT_MODEL_PHASE1: ModelName = 'gemini-3-flash-preview'
const DEFAULT_MODEL_PHASE2: ModelName = 'gemini-3-flash-preview'

// ══════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════

export default class LangchainAgentService {
  private photoManager: PhotoManager
  private searchService: SearchTextService
  private toolsService: AgentToolsService

  constructor() {
    this.photoManager = new PhotoManager()
    this.searchService = new SearchTextService()
    this.toolsService = new AgentToolsService(this.photoManager, this.searchService)
  }

  // ── Public API ──────────────────────────────────────────────

  public static async clearHistory(userId: number): Promise<void> {
    await LangchainAgentService.deleteHistory(userId)
  }

  public async chat(
    userId: number,
    message: string,
    contextPhotoIds: number[] = []
  ): Promise<AgentChatResult> {
    const session = await this.initChatSession(userId, message, contextPhotoIds)
    await this.prefetchAttachedPhotos(session, contextPhotoIds)
    await this.runPhase1Loop(session)
    const structured = await this.runPhase2(session, contextPhotoIds)
    return this.finalizeResult(session, structured, contextPhotoIds)
  }

  // ── Session init ─────────────────────────────────────────────

  private async initChatSession(
    userId: number,
    message: string,
    contextPhotoIds: number[]
  ): Promise<ChatSession> {
    const history = await LangchainAgentService.getHistory(userId)
    const foundPhotoIds: number[] = []
    const modelName = DEFAULT_MODEL_PHASE1
    const provider = LangchainAgentService.getProviderFromModel(modelName)
    const modelNamePhase2 = DEFAULT_MODEL_PHASE2
    const providerPhase2 = LangchainAgentService.getProviderFromModel(modelNamePhase2)
    console.log(
      `[Agent] 🤖 Phase 1 model: ${modelName} (${provider.toUpperCase()})` +
        (modelName !== modelNamePhase2
          ? ` | Phase 2 model: ${modelNamePhase2} (${providerPhase2.toUpperCase()})`
          : ' (same for Phase 2)')
    )

    const tools = this.toolsService.createTools(userId, foundPhotoIds, provider)
    const doneTool = this.createDoneTool()
    const allTools = [...tools, doneTool]
    const modelWithTools = LangchainAgentService.createChatModel(
      modelName,
      undefined,
      'low'
    ).bindTools(allTools, { tool_choice: 'any' })
    const toolMap = Object.fromEntries(allTools.map((t) => [t.name, t]))

    const userContext = await this.buildUserContext(userId)
    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
    const messages = this.buildMessageList(history, currentUserMessage, userContext)

    _debug.calls = []
    console.log(
      `\n[Agent] ▶ Starting | userId=${userId} | message="${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`
    )

    return {
      userId,
      message,
      history,
      modelName,
      provider,
      modelNamePhase2,
      providerPhase2,
      userContext,
      messages,
      toolMap,
      modelWithTools,
      foundPhotoIds,
      toolsUsed: [],
      intermediateSteps: [],
      iterationUsages: [],
      totalIter: 0,
    }
  }

  private createDoneTool() {
    return tool(async () => 'ok', {
      name: 'done',
      description:
        'Signal that data collection is complete. Call this (alone) when you have gathered all the information needed to answer the user. Do NOT call any other tool in the same step as done.',
      schema: z.object({}),
    })
  }

  private async prefetchAttachedPhotos(
    session: ChatSession,
    contextPhotoIds: number[]
  ): Promise<void> {
    if (contextPhotoIds.length === 0) return
    const prefetchCallId = `prefetch-get_photo_info-${Date.now()}`
    const prefetchToolCall = {
      name: 'get_photo_info',
      args: { photoIds: contextPhotoIds },
      id: prefetchCallId,
    }
    console.log(`[Agent] 📎 Pre-fetching ${contextPhotoIds.length} attached photo(s) (text only)…`)
    const prefetchToolMsgs = await this.executeToolCalls(
      [prefetchToolCall],
      session.toolMap,
      session.toolsUsed,
      session.intermediateSteps
    )
    session.messages.push(
      new AIMessage({ content: '', tool_calls: [prefetchToolCall] }),
      ...prefetchToolMsgs
    )
  }

  // ── Message building ─────────────────────────────────────────

  private buildCurrentUserMessage(message: string, contextPhotoIds: number[]): HumanMessage {
    if (contextPhotoIds.length === 0) return new HumanMessage(message)
    const prefix = `[Attached photo IDs: ${contextPhotoIds.join(', ')}]\n`
    return new HumanMessage(prefix + message)
  }

  private async buildUserContext(userId: number): Promise<string> {
    const [user, photoCount] = await Promise.all([
      User.find(userId),
      Photo.query()
        .where('user_id', userId)
        .count('* as total')
        .then((r) => Number(r[0].$extras.total ?? 0)),
    ])
    if (!user) return ''

    const lines: string[] = ['## Current user context']
    lines.push(`- Current date: ${new Date().toISOString().slice(0, 10)}`)
    lines.push(`- Name: ${user.name}`)
    if (user.preferredSource) lines.push(`- Preferred upload source: ${user.preferredSource}`)
    if (user.profiles) lines.push(`- Photography profile: ${user.profiles}`)
    lines.push(`- Catalog size: ${photoCount} photo${photoCount !== 1 ? 's' : ''}`)

    const hasPatterns = user.catalogPatterns && Object.keys(user.catalogPatterns).length > 0
    if (photoCount < 100 || !hasPatterns) {
      lines.push(
        `- Note: this user is relatively new to the app and their catalog is still in its early stages. Be cautious with broad generalisations about their photography or overall style and mention the need for more photos in order to elaborate a better analysis.`
      )
    }

    return lines.join('\n')
  }

  private buildMessageList(
    history: ChatMessage[],
    currentUserMessage: HumanMessage,
    userContext: string = ''
  ): any[] {
    const phase1Prompt = SYSTEM_PROMPT_BASE + PHASE1_ROLE_ADDENDUM
    const systemContent = userContext ? `${phase1Prompt}\n\n${userContext}` : phase1Prompt
    const messages: any[] = [new SystemMessage(systemContent)]

    for (const m of history) {
      if (typeof m.content !== 'string' || m.content.trim().length === 0) continue

      if (m.role === 'user') {
        const photoSuffix =
          m.photoIds && m.photoIds.length > 0 ? `\n[Photo IDs: ${m.photoIds.join(', ')}]` : ''
        messages.push(new HumanMessage(m.content + photoSuffix))
      } else {
        const photoNote =
          m.photoIds && m.photoIds.length > 0
            ? `\n[INTERNAL_CONTEXT: shown_photo_ids=${m.photoIds.join(',')}]`
            : ''
        messages.push(new AIMessage(m.content + photoNote))
      }
    }

    messages.push(currentUserMessage)
    return messages
  }

  // ── Phase 1 ──────────────────────────────────────────────────

  private async runPhase1Loop(session: ChatSession): Promise<void> {
    const MAX_ITERATIONS = 3
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      session.totalIter = iter + 1
      console.log(`[Agent] 🔄 Iteration ${session.totalIter}/${MAX_ITERATIONS} — calling model…`)

      const response = await session.modelWithTools.invoke(session.messages, {
        callbacks: [makeDebugCallback(`phase1-iter-${iter}`)],
      })
      session.iterationUsages.push(
        LangchainAgentService.computeCallCost(
          `phase1-iter-${iter}`,
          session.modelName,
          response.usage_metadata
        )
      )
      const toolCalls = response.tool_calls ?? []
      const calledDone = toolCalls.some((tc: any) => tc.name === 'done')
      const realToolCalls = toolCalls.filter((tc: any) => tc.name !== 'done')

      this.logPhantomText(response.content, session.totalIter)

      if (calledDone && realToolCalls.length === 0) {
        console.log(
          `[Agent] ✅ Data phase complete after ${session.totalIter} iteration(s) (done signal).`
        )
        break
      }

      if (toolCalls.length === 0) {
        console.warn(
          `[Agent] ⚠️  No tool calls returned despite tool_choice:'any' — treating as done.`
        )
        break
      }

      if (realToolCalls.length > 0) {
        await this.executePhase1Iteration(session, toolCalls, realToolCalls, calledDone)
      }

      if (calledDone) {
        console.log(
          `[Agent] ✅ Data phase complete after ${session.totalIter} iteration(s) (done + tools).`
        )
        break
      }
    }
  }

  private logPhantomText(content: any, iter: number): void {
    const phantomText = LangchainAgentService.extractTextContent(content).trim()
    if (!phantomText) return
    const estimate = Math.ceil(phantomText.length / 4)
    console.warn(
      `[Agent] 👻 PHANTOM TEXT in Phase 1 iter ${iter}: ` +
        `~${estimate} tokens wasted | ` +
        `Preview: "${phantomText.slice(0, 300)}${phantomText.length > 300 ? '…' : ''}"`
    )
  }

  private async executePhase1Iteration(
    session: ChatSession,
    allTCs: any[],
    realTCs: any[],
    calledDone: boolean
  ): Promise<void> {
    // ── Guard: enforce max 1 call per tool name per step ──
    const allowedIds = LangchainAgentService.deduplicateToolCalls(allTCs)

    session.messages.push(new AIMessage({ content: '', tool_calls: allTCs }))
    console.log(
      `[Agent] 🔧 Tool calls (${realTCs.length}): ${realTCs.map((tc: any) => tc.name).join(', ')}${calledDone ? ' + done' : ''}`
    )
    const toolMsgs = await Promise.all(
      allTCs.map(async (tc: any) => {
        if (tc.name === 'done') return new ToolMessage({ content: 'ok', tool_call_id: tc.id })

        // Block duplicate calls for the same tool in this step
        if (!allowedIds.has(tc.id)) {
          console.warn(
            `[Agent]   🚫 Blocked duplicate "${tc.name}" (id=${tc.id}) — only one call per tool per step allowed.`
          )
          return new ToolMessage({
            content: JSON.stringify({
              error:
                `Only one "${tc.name}" call is allowed per step. ` +
                'Combine criteria within a single call, or call it again in the next step.',
            }),
            tool_call_id: tc.id,
            name: tc.name,
          })
        }

        const results = await this.executeToolCalls(
          [tc],
          session.toolMap,
          session.toolsUsed,
          session.intermediateSteps
        )
        return results[0]
      })
    )
    session.messages.push(...toolMsgs)
    LangchainAgentService.compressPriorToolMessages(session.messages, toolMsgs.length)
  }

  /**
   * Returns a Set of tool-call IDs that are allowed to execute.
   * For each tool name, only the first occurrence is kept; subsequent
   * duplicates are excluded so the model gets an error and can retry
   * in the next iteration.
   */
  private static deduplicateToolCalls(toolCalls: any[]): Set<string> {
    const allowed = new Set<string>()
    const seenTools = new Set<string>()
    for (const tc of toolCalls) {
      if (tc.name === 'done') {
        allowed.add(tc.id)
        continue
      }
      if (seenTools.has(tc.name)) continue // skip duplicate
      seenTools.add(tc.name)
      allowed.add(tc.id)
    }
    return allowed
  }

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

        console.log(
          `[Agent]   ⚙️  Calling tool "${tc.name}" with args: ${compactPreview(JSON.stringify(tc.args))}`
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
        console.log(`[Agent]   ✔️  Tool "${tc.name}" → ${durationMs}ms | ${compactPreview(result)}`)
        intermediateSteps.push({ tool: tc.name, input: tc.args, output: result, durationMs })

        return new ToolMessage({ content: result, tool_call_id: tc.id, name: tc.name })
      })
    )
  }

  // ── Phase 2 ──────────────────────────────────────────────────

  private async runPhase2(
    session: ChatSession,
    contextPhotoIds: number[]
  ): Promise<Awaited<ReturnType<typeof LangchainAgentService.invokeStructuredFinalAnswer>>> {
    const compressedMessages = LangchainAgentService.compressMessagesForPhase2(
      session.messages,
      session.userContext
    )
    const phase2VisualContext = await this.buildPhase2VisualContext(
      contextPhotoIds,
      session.intermediateSteps,
      session.providerPhase2
    )
    return LangchainAgentService.invokeStructuredFinalAnswer(session.modelNamePhase2, [
      ...compressedMessages,
      ...phase2VisualContext,
    ])
  }

  private async buildPhase2VisualContext(
    contextPhotoIds: number[],
    intermediateSteps: IntermediateStep[],
    provider: ModelProvider
  ): Promise<HumanMessage[]> {
    const result: HumanMessage[] = []
    const photoImageService = PhotoImageService.getInstance()

    // ── Helper: fetch photos with interleaved text + thumbnail ──
    const fetchWithImages = async (
      photoIds: number[],
      limit: number
    ): Promise<{ parts: any[]; count: number }> => {
      const idsToFetch = photoIds.slice(0, limit)
      const photos = await this.photoManager.getPhotosByIds(idsToFetch)
      const photoMap = new Map(photos.map((p) => [p.id, p]))
      const parts: any[] = []
      let count = 0

      for (const id of idsToFetch) {
        const photo = photoMap.get(id)
        if (!photo) continue

        parts.push({
          type: 'text',
          text: `[Photo ID ${photo.id} — ${photo.originalFileName}]\n${JSON.stringify(photoDataForAgentPreview(photo))}`, // compact: no whitespace to save tokens
        })

        try {
          if (provider === 'openai') {
            const url = photo.thumbnailUrl
            if (url) {
              parts.push({ type: 'image_url', image_url: { url } })
              count++
            }
          } else {
            const base64 = await photoImageService.getImageBase64FromR2(photo.thumbnailName, false)
            if (base64) {
              parts.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              })
              count++
            }
          }
        } catch {
          // Image fetch failed — text description is still included
        }
      }
      return { parts, count }
    }

    // ── Helper: fetch photos as rich text-only (no thumbnail) ──
    const fetchTextOnly = async (
      photoIds: number[],
      formatter: (photo: any) => Record<string, any> = photoDataForAgentRich
    ): Promise<any[]> => {
      if (photoIds.length === 0) return []
      const photos = await this.photoManager.getPhotosByIds(photoIds)
      const photoMap = new Map(photos.map((p) => [p.id, p]))
      const parts: any[] = []

      for (const id of photoIds) {
        const photo = photoMap.get(id)
        if (!photo) continue

        parts.push({
          type: 'text',
          text: `[Photo ID ${photo.id} — ${photo.originalFileName} (text-only)]\n${JSON.stringify(formatter(photo))}`, // compact: no whitespace to save tokens
        })
      }
      return parts
    }

    // ── 1. User's attached photos (always get images) ──
    if (contextPhotoIds.length > 0) {
      const { parts, count } = await fetchWithImages(contextPhotoIds, PHASE2_MAX_THUMBNAILS)
      if (parts.length > 0) {
        result.push(
          new HumanMessage({
            content: [
              {
                type: 'text',
                text: `[User's attached photos — ${count} photo(s) with description + thumbnail for visual reference]`,
              },
              ...parts,
            ],
          })
        )
        console.log(`[Agent] 👁️  Phase 2 visual: ${count} user attachment image(s)`)
      }
    }

    // ── 2. Tool result photos (image-eligible vs text-only) ──
    const allGroups = LangchainAgentService.extractAllPhotoIdsGrouped(intermediateSteps)
    const seenIds = new Set(contextPhotoIds)
    let remainingThumbnails = Math.max(
      0,
      PHASE2_MAX_THUMBNAILS - Math.min(contextPhotoIds.length, PHASE2_MAX_THUMBNAILS)
    )
    let remainingTextOnlySlots = PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS

    if (allGroups.length > 0) {
      console.log(
        `[Agent] 👁️  Phase 2 context: ${allGroups.length} photo group(s) from tool results:`
      )
      for (const g of allGroups) {
        console.log(
          `[Agent]     📦 ${g.tool} (step ${g.stepIndex}): ${g.ids.length} photo(s) → [${g.ids.slice(0, 8).join(', ')}${g.ids.length > 8 ? ', …' : ''}]`
        )
      }

      // Process most-recent groups first so they get image priority
      for (const group of [...allGroups].reverse()) {
        const groupIds = group.ids.filter((id) => !seenIds.has(id))
        if (groupIds.length === 0) continue

        const isImageEligible = IMAGE_ELIGIBLE_TOOLS.has(group.tool)

        if (isImageEligible) {
          // ── Image-eligible tool: thumbnails first, overflow goes to text-only pool ──
          const withImageIds = remainingThumbnails > 0 ? groupIds.slice(0, remainingThumbnails) : []
          const textOnlyIds = groupIds.slice(withImageIds.length)
          const cappedTextOnlyIds = textOnlyIds.slice(0, remainingTextOnlySlots)

          const { parts: imageParts, count: imageCount } = await fetchWithImages(
            withImageIds,
            remainingThumbnails
          )
          const textParts = await fetchTextOnly(cappedTextOnlyIds, photoDataForAgentPreview)
          const allParts = [...imageParts, ...textParts]

          if (allParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${imageCount} photo(s) with thumbnail + ${cappedTextOnlyIds.length} text-only]`,
                  },
                  ...allParts,
                ],
              })
            )
            console.log(
              `[Agent] 👁️  Phase 2 — ${group.tool} (step ${group.stepIndex}): ${imageCount} with thumbnail, ${cappedTextOnlyIds.length} text-only`
            )
          }
          remainingThumbnails -= imageCount
          remainingTextOnlySlots -= cappedTextOnlyIds.length

          for (const id of [...withImageIds, ...cappedTextOnlyIds]) seenIds.add(id)
        } else {
          // ── Text-only tool (catalog_sample, etc.) ──
          if (remainingTextOnlySlots <= 0) continue
          const cappedIds = groupIds.slice(0, remainingTextOnlySlots)

          const textParts = await fetchTextOnly(cappedIds, photoDataForAgentRich)
          if (textParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${cappedIds.length} photo(s), detailed text-only descriptions]`,
                  },
                  ...textParts,
                ],
              })
            )
            console.log(
              `[Agent] 👁️  Phase 2 — ${group.tool} (step ${group.stepIndex}): ${cappedIds.length} text-only (text-only tool)`
            )
          }
          remainingTextOnlySlots -= cappedIds.length
          for (const id of cappedIds) seenIds.add(id)
        }
      }
    }

    return result
  }

  // ── Result finalisation ──────────────────────────────────────

  private async finalizeResult(
    session: ChatSession,
    structured: Awaited<ReturnType<typeof LangchainAgentService.invokeStructuredFinalAnswer>>,
    contextPhotoIds: number[]
  ): Promise<AgentChatResult> {
    const rawOutput = structured.text ?? ''
    const output = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()

    const photoGroups: PhotoGroup[] = (structured.photo_groups ?? []).map((g) => ({
      label: g.label,
      photoIds: g.photo_ids ?? [],
    }))
    const allPhotoIds = photoGroups.flatMap((g) => g.photoIds)
    session.foundPhotoIds.push(...allPhotoIds)

    const phase2Usage = LangchainAgentService.computeCallCost(
      'phase2',
      session.modelNamePhase2,
      structured.usage
    )
    const total = LangchainAgentService.sumUsageEntries([...session.iterationUsages, phase2Usage])
    const cost: AgentCostBreakdown = {
      iterations: session.iterationUsages,
      phase2: phase2Usage,
      total,
    }

    console.log(
      `[Agent] ✅ Done. Tools used: [${session.toolsUsed.join(', ') || 'none'}] | Photo groups: ${photoGroups.length} (${allPhotoIds.length} total IDs)`
    )
    console.log(
      `[Agent] 💰 Cost: €${total.costEur.toFixed(6)} | Tokens in=${total.inputTokens} (cached=${total.cachedTokens}) out=${total.outputTokens}`
    )
    console.log(
      `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"`
    )

    await this.persistHistory(
      session.userId,
      session.history,
      session.message,
      contextPhotoIds,
      output,
      photoGroups
    )
    return {
      output,
      photoGroups,
      toolsUsed: session.toolsUsed,
      intermediateSteps: session.intermediateSteps,
      totalIterations: session.totalIter,
      cost,
    }
  }

  private async persistHistory(
    userId: number,
    history: ChatMessage[],
    message: string,
    contextPhotoIds: number[],
    output: string,
    photoGroups: PhotoGroup[]
  ): Promise<void> {
    if (!output.trim()) return
    const allPhotoIds = photoGroups.flatMap((g) => g.photoIds)
    const updatedHistory = [
      ...history,
      {
        role: 'user' as const,
        content: message,
        photoIds: contextPhotoIds.length > 0 ? contextPhotoIds : undefined,
      },
      {
        role: 'assistant' as const,
        content: output,
        photoIds: allPhotoIds.length > 0 ? allPhotoIds : undefined,
        photoGroups: photoGroups.length > 0 ? photoGroups : undefined,
      },
    ]
    await LangchainAgentService.setHistory(userId, updatedHistory.slice(-(MAX_HISTORY_TURNS * 2)))
  }

  // ── Model management ─────────────────────────────────────────

  private static getProviderFromModel(model: ModelName): ModelProvider {
    return model.startsWith('gemini') ? 'gemini' : 'openai'
  }

  private static createChatModel(
    model: ModelName = 'gpt-5.1',
    maxTokensOverride?: number,
    effortOverride?: 'low' | 'medium' | 'high'
  ) {
    const provider = LangchainAgentService.getProviderFromModel(model)
    if (provider === 'gemini') {
      return new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        maxOutputTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      })
    }
    return new ChatOpenAI({
      apiKey: process.env.OPENAI_KEY,
      model,
      reasoning: { effort: effortOverride ?? 'medium' },
    })
  }

  // ── Message compression ──────────────────────────────────────

  private static extractTextContent(content: any): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('')
    }
    return ''
  }

  private static slimToolMessage(msg: ToolMessage): ToolMessage {
    if (typeof msg.content !== 'string') return msg
    if (msg.name && NON_PHOTO_TOOLS.has(msg.name)) return msg
    try {
      const parsed = JSON.parse(msg.content)

      // Shape 1: raw array (get_photo_info)
      if (Array.isArray(parsed)) {
        if (parsed.length === 0 || !parsed[0]?.id) return msg
        const slim = parsed.map((p: any) => ({ id: p.id, originalFileName: p.originalFileName }))
        return new ToolMessage({ content: JSON.stringify(slim), tool_call_id: msg.tool_call_id })
      }

      // Shape 2: object with photos/results array (search_advanced)
      const photos = parsed.photos ?? parsed.results ?? []
      if (photos.length === 0) return msg
      const slim = {
        returned: photos.length,
        photos: photos.map((p: any) => ({ id: p.id, originalFileName: p.originalFileName })),
      }
      return new ToolMessage({ content: JSON.stringify(slim), tool_call_id: msg.tool_call_id })
    } catch {
      return msg
    }
  }

  private static compressPriorToolMessages(messages: any[], freshCount: number): void {
    const cutoff = messages.length - freshCount
    for (let i = cutoff - 1; i >= 0; i--) {
      if (messages[i] instanceof ToolMessage) {
        messages[i] = LangchainAgentService.slimToolMessage(messages[i])
      }
    }
  }

  private static compressMessagesForPhase2(messages: any[], userContext: string = ''): any[] {
    return messages.map((msg, idx) => {
      if (idx === 0 && msg instanceof SystemMessage) {
        const phase2Prompt = SYSTEM_PROMPT_BASE + PHASE2_ROLE_ADDENDUM
        const content = userContext ? `${phase2Prompt}\n\n${userContext}` : phase2Prompt
        return new SystemMessage(content)
      }
      if (!(msg instanceof ToolMessage)) return msg
      return LangchainAgentService.slimToolMessage(msg)
    })
  }

  private static extractAllPhotoIdsGrouped(steps: IntermediateStep[]): PhotoIdGroup[] {
    const groups: PhotoIdGroup[] = []

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]

      if (step.tool === 'search_advanced') {
        try {
          const parsed = JSON.parse(step.output)
          const photos = parsed.photos ?? []
          if (Array.isArray(photos) && photos.length > 0) {
            const ids = photos.map((p: any) => p.id).filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'catalog_sample') {
        try {
          const parsed = JSON.parse(step.output)
          const buckets = parsed.buckets ?? []
          if (Array.isArray(buckets) && buckets.length > 0) {
            const ids = buckets
              .flatMap((b: any) => (b.photos ?? []).map((p: any) => p.id))
              .filter((id: any) => typeof id === 'number')
            if (ids.length > 0) groups.push({ tool: step.tool, ids, stepIndex: i })
          }
        } catch {}
        continue
      }

      if (step.tool === 'get_photo_info') {
        const ids = step.input?.photoIds
        if (Array.isArray(ids) && ids.length > 0) {
          const validIds = ids.filter((id: any) => typeof id === 'number')
          if (validIds.length > 0) groups.push({ tool: step.tool, ids: validIds, stepIndex: i })
        }
        continue
      }
    }
    return groups
  }

  // ── Cost tracking ─────────────────────────────────────────────

  private static computeCallCost(label: string, model: ModelName, usageMeta: any): TokenUsageEntry {
    const inputTokens = usageMeta?.input_tokens ?? 0
    const outputTokens = usageMeta?.output_tokens ?? 0
    const cachedTokens = usageMeta?.input_token_details?.cache_read ?? 0
    const totalTokens = usageMeta?.total_tokens ?? inputTokens + outputTokens

    const prices = (
      PRICES as Record<
        string,
        { input_cache_miss: number; input_cache_hit: number; output: number }
      >
    )[model]
    let costEur = 0
    if (prices) {
      const cacheMiss = inputTokens - cachedTokens
      costEur =
        (cacheMiss * prices.input_cache_miss +
          cachedTokens * prices.input_cache_hit +
          outputTokens * prices.output) *
        USD_TO_EUR
    }

    return { label, inputTokens, cachedTokens, outputTokens, totalTokens, costEur }
  }

  private static sumUsageEntries(entries: TokenUsageEntry[]): TokenUsageEntry {
    return entries.reduce(
      (acc, e) => ({
        label: 'total',
        inputTokens: acc.inputTokens + e.inputTokens,
        cachedTokens: acc.cachedTokens + e.cachedTokens,
        outputTokens: acc.outputTokens + e.outputTokens,
        totalTokens: acc.totalTokens + e.totalTokens,
        costEur: acc.costEur + e.costEur,
      }),
      {
        label: 'total',
        inputTokens: 0,
        cachedTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costEur: 0,
      }
    )
  }

  // ── Phase 2 invocation (with retry) ──────────────────────────

  private static async invokeStructuredFinalAnswer(
    modelName: ModelName,
    messages: any[]
  ): Promise<{
    text: string
    photo_groups: Array<{ label: string; photo_ids: number[] }>
    usage?: any
  }> {
    const MAX_ATTEMPTS = 3
    const TOKEN_BUDGET = 6000
    const model = LangchainAgentService.createChatModel(
      modelName,
      TOKEN_BUDGET,
      'medium'
    ).withStructuredOutput(FINAL_ANSWER_SCHEMA)
    const phase2Messages = [...messages, new HumanMessage(PHASE2_TRIGGER)]

    let lastError: any
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[Agent] 🏁 Phase 2 attempt ${attempt + 1}/${MAX_ATTEMPTS}…`)
        const usageCollector: { usage?: any } = {}
        const result = (await model.invoke(phase2Messages, {
          callbacks: [makeDebugCallback('phase2'), makeUsageCallback(usageCollector)],
        })) as { text: string; photo_groups: Array<{ label: string; photo_ids: number[] }> }
        return { ...result, usage: usageCollector.usage }
      } catch (err: any) {
        lastError = err
        console.warn(
          `[Agent] ⚠️  Phase 2 attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${err.message}`
        )
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
        }
      }
    }
    throw lastError
  }

  // ── History (Redis) ───────────────────────────────────────────

  private static redisHistoryKey(userId: number): string {
    return `agent:history:${userId}`
  }

  private static async getHistory(userId: number): Promise<ChatMessage[]> {
    try {
      const data = await redis.get(LangchainAgentService.redisHistoryKey(userId))
      return data ? (JSON.parse(data) as ChatMessage[]) : []
    } catch (err) {
      console.warn('[Agent] Failed to read history from Redis', err)
      return []
    }
  }

  private static async setHistory(userId: number, history: ChatMessage[]): Promise<void> {
    try {
      await redis.set(
        LangchainAgentService.redisHistoryKey(userId),
        JSON.stringify(history),
        'EX',
        HISTORY_TTL_SECONDS
      )
    } catch (err) {
      console.warn('[Agent] Failed to write history to Redis', err)
    }
  }

  private static async deleteHistory(userId: number): Promise<void> {
    try {
      await redis.del(LangchainAgentService.redisHistoryKey(userId))
    } catch (err) {
      console.warn('[Agent] Failed to delete history from Redis', err)
    }
  }
}
