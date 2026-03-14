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
  photoDataForAgentScan,
} from './agent_tools_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import PhotoImageService from './photo_image_service.js'
import ConversationService from './conversation_service.js'
import QueryService from './query_service.js'
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
- **Language:** Always match the user's language. Use English ALWAYS for internal tool calls.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Stealth:** Never mention tool names or internal IDs to the user.
- **Grounding:** NEVER fabricate photo filenames, descriptions, scores, locations, or content. Only reference photos that were explicitly returned by tool calls. If a tool returns zero results, say so honestly — do not invent data to fill the gap.`

const PHASE1_ROLE_ADDENDUM = `

## Your current role: DATA COLLECTOR
Your ONLY job is to call the right tools to gather data. A later phase with visual access to thumbnails will evaluate and respond.
- Re-search ONLY if there is a clear quantitative gap (e.g. user asked for 5 photos and you got 2).
- If a search returns 0 results, retry with relaxed or alternative parameters.
- When you have all the data, call \`done\`. You MUST always end by calling \`done\`.

## Search & Tool Strategy

**\`search_advanced\`** — the primary search tool. Each parameter targets a different search dimension:
- \`content_tags\`: what appears in the photo — subjects, people, animals, objects, actions (e.g. ["woman"], ["dog", "park"]).
- \`style_query\`: how the photo looks — mood, atmosphere, visual style (e.g. "dark moody portraits").
- \`filter\`: structured metadata — scores, visual aspects (genre, lighting, palette…), dates.
- \`similar_to\`: photos similar to a reference photo.
- Combine dimensions in a single call with \`intersect\` (AND) or \`union\` (OR). Prefer one \`search_advanced\` per step.

**\`catalog_sample\`** — for evolution, progress-over-time, or broad catalog cross-sections.
- Always pair with \`overall_catalog_view\` in parallel.
- \`scan_mode="technical"\` (default) for style/quality analysis; \`scan_mode="semantic"\` for subject/theme analysis.

**\`get_photo_info\`** — ONLY for user-attached photo IDs or IDs from conversation history. NEVER call it on IDs returned by \`search_advanced\` or \`catalog_sample\` — those are fully populated with descriptions, scores, and thumbnails automatically in a later phase.

**\`web_search\`** — only for external facts (gear, techniques, awards, photographer bios). For time-sensitive topics, include current date in the query. Call before any tool whose inputs depend on the web results.

**Parallelism:** call independent tools simultaneously. If one tool's output feeds another's input, call them sequentially.

## Thinking patterns
The examples below show HOW TO THINK about tool orchestration. Extrapolate the underlying logic to new situations — adapt parameters, combine strategies, and invent new patterns as needed.

### Pattern A — Sequential dependency: external info → catalog search
User: "Look up this year's Sony World Photography Awards and recommend photos from my catalog that could fit."
**Think:** I need external info first (award criteria), then search my catalog based on what I learn. Sequential.
1. \`web_search\` → learn categories, themes, judging criteria.
2. \`search_advanced\` — adapt to what was learned:
\`\`\`
search_advanced({
  filter: { scoreFilters: [{ field: "storytelling", min: 7 }, { field: "originality", min: 6 }], visualAspects: { genre: ["documentary"] } },
  style_query: "interesting documentary storytelling",
  operation: "intersect"
})
\`\`\`

### Pattern B — Reversed dependency: profile → external → search
User: "Find current photography awards that match my style."
**Think:** First understand the user's style, then find matching awards, then find best candidate photos. Three sequential steps.
1. \`overall_catalog_view\` + \`catalog_sample(scan_mode="technical")\` in parallel → profile the user's strengths.
2. \`web_search\` → find awards matching those strengths.
3. \`search_advanced\` → find actual best-fit photos for the specific awards.

### Pattern C — Score creativity: surface vs. substance
User: "Find photos that look impressive but lack depth."
**Think:** High visual appeal + low meaning = "pretty but shallow". Combine high+low score thresholds:
\`search_advanced({ filter: { scoreFilters: [{field: "aesthetic_quality", min: 7.5}, {field: "originality", max: 4}, {field: "message", max: 5}] }, operation: "intersect" })\`
The inverse pattern ("hidden gems") would flip the thresholds: high storytelling + low aesthetic.

### Pattern D — Content search: "photos with X in them"
User: "Find my best photos where hats appear."
**Think:** "hats" is a subject (what appears in the photo) → \`content_tags\`. "best" → score filter. Genre (portrait, street…) describes the photographic style, not the subject — a hat can appear in any genre.
\`search_advanced({ content_tags: ["hat"], filter: { scoreFilters: [{field: "aesthetic_quality", min: 7}] }, operation: "intersect" })\`

### Pattern E — Parallel independent searches
User: "Compare my best portraits with my best street photos."
**Think:** Two independent searches by genre and scores — no dependency between them. Parallelize everything.
1. search_advanced({ filter: { visualAspects: { genre: ["portrait"] }, scoreFilters: [{ field: "aesthetic_quality", min: 7.5 }] }, operation: "intersect" }) +
   search_advanced({ filter: { visualAspects: { genre: ["street"] }, scoreFilters: [{ field: "storytelling", min: 7 }] }, operation: "intersect" })

### Pattern F — Catalog evolution
User: "How has my photography style evolved?" / "What subjects do I photograph most?"
**Think:** Evolution = \`catalog_sample\` (not \`search_advanced\`). Choose scan_mode by question type.
- Style/quality question → \`catalog_sample(scan_mode="technical")\` + \`overall_catalog_view\` in parallel.
- Subject/theme question → \`catalog_sample(scan_mode="semantic")\` + \`overall_catalog_view\` in parallel.

## Core rules
1. **Sequential** when one tool's output feeds another's input. **Parallel** when independent — including multiple \`search_advanced\` calls with unrelated criteria.
2. **\`done\`** must always be called to signal completion.`

const PHASE2_ROLE_ADDENDUM = `

## Your current role: CURATOR & JUDGE
You have all gathered data from previous steps. You also have visual access to thumbnail images paired with full descriptions for the user's attached photos and top search results. Use them for visual verification and curatorial judgment.

Photos may arrive with thumbnails (for visual evaluation) or text-only descriptions (from earlier search iterations). Both are valid candidates for your response.

## Curatorial judgment
- **Selectivity:** Only include photos that genuinely match the user's request. Discard tangential or low-relevance results — even if returned by a search tool.
- **Grounding:** Your response MUST be based EXCLUSIVELY on data returned by tools. If no photos were found or all tools returned empty results, state this clearly — NEVER invent filenames, descriptions, or photo content to fill the gap. An empty \`photo_groups\` array is correct when there are no real results.
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
- **Honesty:** Be honest, constructive, and insightful — even if that means tough feedback. Do not flatter the user gratuitously.
- **Formatting:** Use **bold** for filenames, key concepts, and any term worth emphasizing. Use it sparingly — only for genuinely important words, not decoration.
- Use filenames for reference in your text, never raw IDs or tool names.

## Visual Output — photo_groups
- Populate \`photo_groups\` when the user expects visual results (rankings, selections, or sets).
- **Consistency rule (mandatory):** Every photo you mention or reference by filename in the \`text\` field MUST also appear in \`photo_groups\`. No exceptions — if you write about a photo, include its ID.
- **Prefer MULTIPLE groups** over a single flat list. Whenever there is a natural way to subdivide results — by quality tier, theme, genre, time period, or any other meaningful axis — use separate groups. A single \`"result"\` group is only acceptable when the results are genuinely homogeneous and no useful subdivision exists.
- Example groupings to favour: \`"Top picks"\` / \`"Honorable mentions"\`, \`"Portraits"\` / \`"Landscapes"\`, \`"Best of 2024"\` / \`"Best of 2023"\`, \`"Strong"\` / \`"Promising"\`, \`"Candidates"\` / \`"Discarded"\`.
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
  /** id (as string) → "filename — context". Stored in DB for LLM recall; stripped before sending to frontend. */
  photoDescriptions?: Record<string, string>
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
type ModelProvider = 'openai' | 'gemini' | 'deepseek' | 'xai' | 'qwen'

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

const PHASE2_MAX_PHOTOS = 80 // total photos sent to the model (with or without thumbnail)
const PHASE2_MAX_THUMBNAILS = 20 // how many of those can carry a thumbnail image
// → the remaining (PHASE2_MAX_PHOTOS - PHASE2_MAX_THUMBNAILS = 60) are text-only

/** Tools whose Phase 2 photo results are eligible for thumbnail images. */
const IMAGE_ELIGIBLE_TOOLS = new Set(['search_advanced', 'get_photo_info'])

/** Phase 1 model — fixed, no classification needed. */
const MODEL_PHASE1: ModelName = 'gemini-3-flash-preview'

/**
 * Phase 2 model selection — driven by `has_photo_intent` + `needs_artistic_evaluation`.
 * No photo intent           → lite model (cheapest, text-only answer).
 * Photo intent, no artistic → cheap model (handles photos but no deep evaluation).
 * Photo intent + artistic   → expensive model (full curatorial / aesthetic reasoning).
 */
const MODEL_PHASE2_EXPENSIVE: ModelName = 'gpt-5.1'
const MODEL_PHASE2_CHEAP: ModelName = 'gemini-3-flash-preview'
const MODEL_PHASE2_LITE: ModelName = 'gemini-3.1-flash-lite-preview'

// ══════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════

export default class LangchainAgentService {
  private photoManager: PhotoManager
  private searchService: SearchTextService
  private toolsService: AgentToolsService
  private queryService: QueryService

  constructor() {
    this.photoManager = new PhotoManager()
    this.searchService = new SearchTextService()
    this.toolsService = new AgentToolsService(this.photoManager, this.searchService)
    this.queryService = new QueryService()
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * @param forceCheapModel  When true, Phase 2 always uses the cheap model
   *                         regardless of classification (e.g. user ran out of credits).
   */
  public async chat(
    userId: number,
    conversationId: number,
    message: string,
    contextPhotoIds: number[] = [],
    forceCheapModel = false
  ): Promise<AgentChatResult> {
    const session = await this.initChatSession(
      userId,
      conversationId,
      message,
      contextPhotoIds,
      forceCheapModel
    )
    await this.prefetchAttachedPhotos(session, contextPhotoIds)
    await this.runPhase1Loop(session)

    const structured = await this.runPhase2(session, contextPhotoIds)

    return this.finalizeResult(session, structured, contextPhotoIds)
  }

  // ── Session init ─────────────────────────────────────────────

  private async initChatSession(
    userId: number,
    conversationId: number,
    message: string,
    contextPhotoIds: number[],
    forceCheapModel: boolean
  ): Promise<ChatSession> {
    const convService = new ConversationService()
    const [history, classification] = await Promise.all([
      convService.getLLMContext(conversationId),
      this.queryService.classifyQuery(message),
    ])
    const { has_photo_intent, needs_artistic_evaluation } = classification
    const modelName = MODEL_PHASE1
    let modelNamePhase2: ModelName
    if (forceCheapModel) {
      modelNamePhase2 = MODEL_PHASE2_LITE
    } else if (!has_photo_intent) {
      modelNamePhase2 = MODEL_PHASE2_LITE
    } else if (needs_artistic_evaluation) {
      modelNamePhase2 = MODEL_PHASE2_EXPENSIVE
    } else {
      modelNamePhase2 = MODEL_PHASE2_CHEAP
    }
    console.log(
      `[Agent] 🔍 Query classification: photo=${has_photo_intent} artistic=${needs_artistic_evaluation}` +
        (forceCheapModel ? ' (overridden → lite)' : '') +
        ` → Phase1=${modelName} | Phase2=${modelNamePhase2}`
    )
    const foundPhotoIds: number[] = []
    const provider: ModelProvider = LangchainAgentService.getProviderFromModel(modelName)
    const providerPhase2: ModelProvider =
      LangchainAgentService.getProviderFromModel(modelNamePhase2)
    console.log(
      `[Agent] 🤖 Phase 1 model: ${modelName} (${provider.toUpperCase()})` +
        (modelName !== modelNamePhase2
          ? ` | Phase 2 model: ${modelNamePhase2} (${providerPhase2.toUpperCase()})`
          : ' (same for Phase 2)')
    )

    const tools = this.toolsService.createTools(userId, foundPhotoIds, provider)
    const doneTool = this.createDoneTool()
    const allTools = [...tools, doneTool]
    // 'any' = Gemini, 'required' = OpenAI/xAI (forces tool call, prevents phantom text), 'auto' = DeepSeek
    // 'any' = Gemini, 'required' = OpenAI/xAI (forces tool call, prevents phantom text), 'auto' = DeepSeek/Qwen
    const toolChoice =
      provider === 'deepseek' || provider === 'qwen'
        ? 'auto'
        : provider === 'xai'
          ? 'required'
          : 'any'
    // Phase 1 only emits tool calls — cap output tokens to avoid paying for phantom text.
    // Disable thinking for Phase 1: thinking models (e.g. gemini-3-flash) consume
    // maxOutputTokens for both thinking AND tool-call JSON. With a tight budget (500),
    // thinking eats all tokens → empty response → premature "done".
    const PHASE1_MAX_OUTPUT_TOKENS = 500
    const modelWithTools = LangchainAgentService.createChatModel(
      modelName,
      PHASE1_MAX_OUTPUT_TOKENS,
      'low',
      true // disableThinking — Phase 1 is tool-only, no reasoning needed
    ).bindTools(allTools, { tool_choice: toolChoice })
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
    const [user, photoCount, analyzedCount] = await Promise.all([
      User.find(userId),
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
    if (!user) return ''

    const lines: string[] = ['## Current user context']
    lines.push(`- Current date: ${new Date().toISOString().slice(0, 10)}`)
    lines.push(`- Name: ${user.name}`)
    if (user.preferredSource) lines.push(`- Preferred upload source: ${user.preferredSource}`)
    if (user.profiles) lines.push(`- Photography profile: ${user.profiles}`)
    lines.push(
      `- Catalog size: ${photoCount} photo${photoCount !== 1 ? 's' : ''} (${analyzedCount} analyzed)`
    )

    // Note: the 0-photos and 0-analyzed branches are handled upstream by ChatController
    // (routed to LangchainAgentKnowledgeService). This service is only reached when
    // analyzedCount > 0, so only the "early catalog" note is relevant here.
    const hasPatterns = user.catalogPatterns && Object.keys(user.catalogPatterns).length > 0
    if (analyzedCount < 100 || !hasPatterns) {
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
        // Assistant messages: append photo IDs + per-photo descriptions so the LLM
        // can match user references like "la de la niña" to the correct photo.
        const shownIds = m.photoGroups?.flatMap((g) => g.photoIds) ?? []
        const photoNote =
          shownIds.length > 0 ? `\n[INTERNAL_CONTEXT: shown_photo_ids=${shownIds.join(',')}]` : ''

        let descNote = ''
        if (m.photoGroups && m.photoGroups.length > 0) {
          const descLines: string[] = []
          for (const group of m.photoGroups) {
            if (group.photoDescriptions && Object.keys(group.photoDescriptions).length > 0) {
              descLines.push(`Group "${group.label}":`)
              for (const [id, desc] of Object.entries(group.photoDescriptions)) {
                descLines.push(`  - ID ${id}: ${desc}`)
              }
            }
          }
          if (descLines.length > 0) {
            descNote = '\n[Photo references from this response:]\n' + descLines.join('\n')
          }
        }

        messages.push(new AIMessage(m.content + photoNote + descNote))
      }
    }

    // Push currentUserMessage BEFORE merging so it is included in the alternation fix.
    // This matters when an assistant error was filtered out (isError=true), leaving two
    // consecutive HumanMessages — the merge loop below will collapse them correctly.
    messages.push(currentUserMessage)

    // Gemini requires strict user/model alternation — merge consecutive same-role messages
    // to avoid an unstructured API error that LangChain's error handler cannot surface properly.
    const merged: any[] = [messages[0]] // always keep SystemMessage first
    for (let i = 1; i < messages.length; i++) {
      const prev = merged[merged.length - 1]
      const curr = messages[i]
      if (prev instanceof HumanMessage && curr instanceof HumanMessage) {
        const prevText = LangchainAgentService.extractTextContent(prev.content)
        const currText = LangchainAgentService.extractTextContent(curr.content)
        merged[merged.length - 1] = new HumanMessage(prevText + '\n' + currText)
      } else if (
        prev instanceof AIMessage &&
        curr instanceof AIMessage &&
        !(prev instanceof ToolMessage) &&
        !(curr instanceof ToolMessage)
      ) {
        const prevText = LangchainAgentService.extractTextContent(prev.content)
        const currText = LangchainAgentService.extractTextContent(curr.content)
        merged[merged.length - 1] = new AIMessage(prevText + '\n' + currText)
      } else {
        merged.push(curr)
      }
    }

    return merged
  }

  // ── Phase 1 ──────────────────────────────────────────────────

  private async runPhase1Loop(session: ChatSession): Promise<void> {
    const MAX_ITERATIONS = 4
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      session.totalIter = iter + 1
      console.log(`[Agent] 🔄 Iteration ${session.totalIter}/${MAX_ITERATIONS} — calling model…`)

      let response: any
      try {
        response = await session.modelWithTools.invoke(session.messages, {
          callbacks: [makeDebugCallback(`phase1-iter-${iter}`)],
        })
      } catch (err: any) {
        // LangChain sometimes loses the original error and throws on undefined.message —
        // log the raw error object so we can see what actually went wrong.
        console.error(
          `[Agent] ❌ Phase 1 model invoke failed (iter ${session.totalIter}):`,
          err?.message ?? err
        )
        throw err
      }
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
    session.messages.push(new AIMessage({ content: '', tool_calls: allTCs }))
    console.log(
      `[Agent] 🔧 Tool calls (${realTCs.length}): ${realTCs.map((tc: any) => tc.name).join(', ')}${calledDone ? ' + done' : ''}`
    )
    const toolMsgs = await Promise.all(
      allTCs.map(async (tc: any) => {
        if (tc.name === 'done') return new ToolMessage({ content: 'ok', tool_call_id: tc.id })

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
  ): Promise<{
    text: string
    photo_groups: Array<{ label: string; photo_ids: number[] }>
    usage?: any
  }> {
    const phase2Messages = LangchainAgentService.buildPhase2Messages(
      session.messages,
      session.userContext,
      session.intermediateSteps
    )
    const phase2VisualContext = await this.buildPhase2VisualContext(
      contextPhotoIds,
      session.intermediateSteps,
      session.providerPhase2
    )
    return LangchainAgentService.invokeStructuredFinalAnswer(session.modelNamePhase2, [
      ...phase2Messages,
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
          text: `[${photo.originalFileName} — id:${photo.id}]\n${JSON.stringify(photoDataForAgentPreview(photo))}`, // compact: no whitespace to save tokens
        })

        // DeepSeek and Qwen Phase 1 models do not support vision — skip image parts entirely
        if (provider === 'deepseek' || provider === 'qwen') continue

        try {
          if (provider === 'openai' || provider === 'xai') {
            // OpenAI and xAI both accept image_url with a direct URL
            const url = photo.thumbnailUrl
            if (url) {
              parts.push({ type: 'image_url', image_url: { url, detail: 'low' } })
              count++
            }
          } else {
            // gemini: base64
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

    // ── Helper: fetch photos as text-only (no thumbnail) ──
    const fetchTextOnly = async (
      photoIds: number[],
      formatter: (photo: any) => Record<string, any> = photoDataForAgentPreview
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
          text: `[${photo.originalFileName} — id:${photo.id} (text-only)]\n${JSON.stringify(formatter(photo))}`, // compact: no whitespace to save tokens
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

          let formatter: (photo: any) => Record<string, any>
          if (group.tool === 'catalog_sample') {
            const scanMode = (intermediateSteps[group.stepIndex]?.input?.scan_mode ??
              'technical') as 'technical' | 'semantic'
            formatter = (photo) => photoDataForAgentScan(photo, scanMode)
          } else {
            formatter = photoDataForAgentPreview
          }

          const textParts = await fetchTextOnly(cappedIds, formatter)
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
    structured: {
      text: string
      photo_groups: Array<{ label: string; photo_ids: number[] }>
      usage?: any
    },
    _contextPhotoIds: number[]
  ): Promise<AgentChatResult> {
    const rawOutput = structured.text ?? ''
    const cleaned = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()

    // Build photoGroups first so their IDs feed the filename→token replacement
    const photoGroups: PhotoGroup[] = (structured.photo_groups ?? []).map((g) => ({
      label: g.label,
      photoIds: g.photo_ids ?? [],
    }))
    await this.enrichPhotoGroupsWithDescriptions(photoGroups)
    const allPhotoIds = photoGroups.flatMap((g) => g.photoIds)
    session.foundPhotoIds.push(...allPhotoIds)

    const output = await this.injectPhotoTokens(cleaned, session.userId, allPhotoIds)

    const phase2Usage = LangchainAgentService.computeCallCost(
      'phase2',
      session.modelNamePhase2,
      structured.usage
    )
    const costEntries = [...session.iterationUsages, phase2Usage]
    const cost: AgentCostBreakdown = {
      iterations: session.iterationUsages,
      phase2: phase2Usage,
    } as AgentCostBreakdown

    cost.total = LangchainAgentService.sumUsageEntries(costEntries)
    const total = cost.total

    console.log(
      `[Agent] ✅ Done. Tools used: [${session.toolsUsed.join(', ') || 'none'}] | Photo groups: ${photoGroups.length} (${allPhotoIds.length} total IDs)`
    )
    console.log(
      `[Agent] 💰 Cost: €${total.costEur.toFixed(6)} | Tokens in=${total.inputTokens} (cached=${total.cachedTokens}) out=${total.outputTokens}`
    )
    console.log(
      `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"`
    )

    // History persistence is now handled by ChatController via ConversationService
    return {
      output,
      photoGroups,
      toolsUsed: session.toolsUsed,
      intermediateSteps: session.intermediateSteps,
      totalIterations: session.totalIter,
      cost,
    }
  }

  /**
   * Post-processing pass: inject [[photo:ID|filename]] tokens into the output text.
   *
   * Primary path  — scan for known filenames (from photo_groups). The model almost
   *   always writes filenames directly, so this is the common case. Also strips
   *   surrounding ** bold markers so the token becomes the sole formatting.
   * Fallback path — scan for bare numeric IDs in case any leaked through.
   *
   * @param knownPhotoIds  IDs already present in photo_groups (pre-fetched, cheap).
   */
  private async injectPhotoTokens(
    text: string,
    userId: number,
    knownPhotoIds: number[]
  ): Promise<string> {
    // Collect any additional numeric IDs that may have leaked into the text
    const numericIds = [...text.matchAll(/\b(\d{3,})\b/g)].map((m) => Number(m[1]))
    const candidateIds = [...new Set([...knownPhotoIds, ...numericIds])]
    if (candidateIds.length === 0) return text

    const photos = await Photo.query()
      .whereIn('id', candidateIds)
      .where('user_id', userId)
      .select(['id', 'original_file_name'])

    if (photos.length === 0) return text

    const idToFilename = new Map<number, string>(photos.map((p) => [p.id, p.originalFileName]))
    const filenameToId = new Map<string, number>(photos.map((p) => [p.originalFileName, p.id]))

    let result = text

    // ── 1. Replace known filenames (possibly wrapped in **bold**) with tokens ──
    // Sort longest-first to avoid partial matches on filenames that share a prefix.
    const filenames = [...filenameToId.keys()].sort((a, b) => b.length - a.length)
    for (const filename of filenames) {
      const id = filenameToId.get(filename)!
      const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match the filename with 0–2 surrounding asterisks on each side
      const pattern = new RegExp(`\\*{0,2}${escaped}\\*{0,2}`, 'g')
      result = result.replace(pattern, (match) => {
        if (match.startsWith('[[photo:')) return match // already tokenised
        console.log(`[Agent] 🔁 Post-process: "${filename}" (id:${id}) → token`)
        return `[[photo:${id}|${filename}]]`
      })
    }

    // ── 2. Fallback: replace any remaining bare numeric IDs ──
    result = result.replace(/\b(\d{3,})\b/g, (match) => {
      const id = Number(match)
      const filename = idToFilename.get(id)
      if (filename) {
        console.log(`[Agent] 🔁 Post-process: bare ID ${id} → token`)
        return `[[photo:${id}|${filename}]]`
      }
      return match
    })

    return result
  }

  /**
   * For each photo group, fetch `descriptions.context` + `originalFileName` and
   * store them as a compact string map so the LLM can recall photos by content
   * across conversation turns.
   */
  private async enrichPhotoGroupsWithDescriptions(photoGroups: PhotoGroup[]): Promise<void> {
    const allIds = photoGroups.flatMap((g) => g.photoIds)
    if (allIds.length === 0) return
    const photos = await this.photoManager.getPhotosByIds(allIds)

    /** Split text into sentences (splitting on '. ', '! ', '? '). */
    const firstSentences = (text: string, n: number): string => {
      if (!text) return ''
      const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
      return sentences.slice(0, n).join(' ').trim()
    }

    const descMap = new Map<number, string>()
    for (const photo of photos) {
      const filename = photo.originalFileName ?? ''
      const contextSnippet = firstSentences(photo.descriptions?.context ?? '', 1)
      const storySnippet = firstSentences(photo.descriptions?.story ?? '', 1)
      const parts = [contextSnippet, storySnippet].filter(Boolean).join(' | ')
      if (filename || parts) {
        descMap.set(photo.id, parts ? `${filename} — ${parts}` : filename)
      }
    }
    for (const group of photoGroups) {
      const descriptions: Record<string, string> = {}
      for (const id of group.photoIds) {
        const desc = descMap.get(id)
        if (desc) descriptions[String(id)] = desc
      }
      if (Object.keys(descriptions).length > 0) {
        group.photoDescriptions = descriptions
      }
    }
  }

  // ── Model management ─────────────────────────────────────────

  private static getProviderFromModel(model: ModelName): ModelProvider {
    if (model.startsWith('gemini')) return 'gemini'
    if (model.startsWith('deepseek')) return 'deepseek'
    if (model.startsWith('grok')) return 'xai'
    if (model.startsWith('qwen')) return 'qwen'
    return 'openai'
  }

  private static createChatModel(
    model: ModelName = 'gpt-5.1',
    maxTokensOverride?: number,
    effortOverride?: 'low' | 'medium' | 'high',
    disableThinking = false
  ) {
    const provider = LangchainAgentService.getProviderFromModel(model)
    if (provider === 'gemini') {
      return new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model,
        maxOutputTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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
    if (provider === 'deepseek') {
      return new ChatOpenAI({
        apiKey: process.env.DEEPSEEK_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: process.env.DEEPSEEK_BASEURL ?? 'https://api.deepseek.com',
        },
      })
    }
    if (provider === 'qwen') {
      return new ChatOpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        },
      })
    }
    if (provider === 'xai') {
      return new ChatOpenAI({
        apiKey: process.env.XAI_API_KEY,
        model,
        maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
        configuration: {
          baseURL: 'https://api.x.ai/v1',
        },
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
    if (msg.name === 'done') return msg
    try {
      const parsed = JSON.parse(msg.content)
      if (parsed.error || parsed._compressed) return msg

      // ── Non-photo tools: compress to structured digest ──

      if (msg.name === 'overall_catalog_view') {
        const patterns = parsed.catalog_patterns ?? {}
        const patternKeys = Object.keys(patterns)
        const clusterCount = patternKeys.reduce((sum: number, key: string) => {
          const arr = patterns[key]
          return sum + (Array.isArray(arr) ? arr.length : 0)
        }, 0)
        const slim = {
          _compressed: true,
          summary: `Catalog analysis retrieved: ${patternKeys.length} pattern type(s) with ${clusterCount} cluster(s), visual_aspects_stats and artistic_scores_stats included. Full data available for evaluation phase.`,
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'catalog_sample') {
        const buckets = parsed.buckets ?? []
        const slim = {
          _compressed: true,
          total_sampled: parsed.total_sampled ?? 0,
          buckets: buckets.map((b: any) => ({
            period: b.period,
            total_in_period: b.total_in_period,
            photo_ids: (b.photos ?? []).map((p: any) => p.id),
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'app_knowledge') {
        const isSpecific = parsed.section !== undefined
        const sections = isSpecific ? [parsed.section] : Object.keys(parsed)
        const slim = {
          _compressed: true,
          summary: `App knowledge retrieved: ${sections.length} section(s) [${sections.join(', ')}]. Full content available for evaluation phase.`,
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'fetch_collections') {
        const slim = {
          _compressed: true,
          collections: (parsed.collections ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            photoCount: (c.samplePhotoIds ?? []).length,
          })),
          series: (parsed.series ?? []).map((s: any) => ({
            id: s.id,
            name: s.name,
            photoCount: (s.samplePhotoIds ?? []).length,
          })),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      if (msg.name === 'web_search') {
        const slim = {
          _compressed: true,
          total: parsed.total ?? 0,
          ...(parsed.answer ? { answer: (parsed.answer as string).slice(0, 150) } : {}),
          urls: (parsed.results ?? []).map((r: any) => r.url).filter(Boolean),
        }
        return new ToolMessage({
          content: JSON.stringify(slim),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        })
      }

      // ── Photo tools: keep only id + filename ──

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

  private static buildPhase2Messages(
    messages: any[],
    userContext: string = '',
    intermediateSteps: IntermediateStep[] = []
  ): any[] {
    // Build a queue of full outputs per restorable tool so we can replace
    // the compressed ToolMessages inline instead of duplicating data.
    const RESTORABLE_TOOLS = new Set(['overall_catalog_view', 'app_knowledge', 'fetch_collections'])
    const restoreQueues = new Map<string, string[]>()
    for (const step of intermediateSteps) {
      if (!RESTORABLE_TOOLS.has(step.tool)) continue
      try {
        const parsed = JSON.parse(step.output)
        if (parsed.error) continue
        if (!restoreQueues.has(step.tool)) restoreQueues.set(step.tool, [])
        restoreQueues.get(step.tool)!.push(step.output)
      } catch {
        continue
      }
    }

    const restoredCount = { n: 0 }
    const result = messages.map((msg, idx) => {
      if (idx === 0 && msg instanceof SystemMessage) {
        const roleAddendum = PHASE2_ROLE_ADDENDUM
        const phase2Prompt = SYSTEM_PROMPT_BASE + roleAddendum
        const content = userContext ? `${phase2Prompt}\n\n${userContext}` : phase2Prompt
        return new SystemMessage(content)
      }
      if (!(msg instanceof ToolMessage)) return msg

      // For restorable tools, inject the full output from intermediateSteps
      // instead of the compressed version — Phase 2 needs the complete data.
      if (msg.name && RESTORABLE_TOOLS.has(msg.name)) {
        const queue = restoreQueues.get(msg.name)
        if (queue && queue.length > 0) {
          const fullOutput = queue.shift()!
          restoredCount.n++
          return new ToolMessage({
            content: fullOutput,
            tool_call_id: msg.tool_call_id,
            name: msg.name,
          })
        }
      }

      return LangchainAgentService.slimToolMessage(msg)
    })

    if (restoredCount.n > 0) {
      console.log(
        `[Agent] 📋 Phase 2 messages: restored ${restoredCount.n} full tool output(s) inline`
      )
    }

    return result
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

      // fetch_collections intentionally excluded: it only provides collection metadata.
      // The agent must call get_photo_info explicitly for any photos it wants to evaluate.
      if (step.tool === 'fetch_collections') continue
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
}
