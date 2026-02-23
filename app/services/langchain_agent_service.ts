import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService from './agent_tools_service.js'
import QueryService from './query_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import redis from '@adonisjs/redis/services/main'

// ─────────────────────────────────────────────────────────────
// Debug payload capture
//
// _debug.calls   → one entry per LLM invocation, in order:
//                  calls[0] = Phase 1 iter 0 (only system + user, no tool results yet)
//                  calls[1] = Phase 1 iter 1 (includes first tool results)
//                  calls[N] = Phase 2 (final structured answer call)
//
// Each entry: { label, messages: [{ role, content, tool_calls?, tool_call_id? }] }
//   role    → 'system' | 'human' | 'ai' | 'tool'
//   content → plain string (or stringified JSON for tool messages)
//             NOTE: tool messages from photo-search tools are COMPRESSED after
//             the first iteration — content becomes { totalMatched, photos:[{id,originalFileName}] }
//
// Add to VS Code Watch panel:
//   _debug.calls                       → all calls
//   _debug.calls[0].messages           → first call (no tool results)
//   _debug.calls[1].messages           → second call (with first tool results)
//   _debug.calls.at(-1).messages       → last call (Phase 2)
//   _debug.calls.at(-1).messages.length → total messages in Phase 2
// Reset automatically at the start of each chat() call.
// ─────────────────────────────────────────────────────────────

/** Converts a LangChain BaseMessage into a plain, readable debug object. */
function serializeMessageForDebug(msg: any): Record<string, any> {
  const base: Record<string, any> = { role: msg.type ?? 'unknown' }

  // content: string or multimodal array
  if (typeof msg.content === 'string') {
    base.content = msg.content
  } else if (Array.isArray(msg.content)) {
    // multimodal — show types only to avoid huge base64 blobs
    base.content = msg.content.map((p: any) =>
      p?.type === 'image_url' || p?.type === 'image'
        ? { type: p.type, source: '[image data omitted]' }
        : p
    )
  }

  // AIMessage with tool calls
  if (msg.tool_calls?.length) {
    base.tool_calls = msg.tool_calls.map((tc: any) => ({
      name: tc.name,
      args: tc.args,
      id: tc.id,
    }))
  }

  // ToolMessage
  if (msg.tool_call_id !== undefined) {
    base.tool_call_id = msg.tool_call_id
  }

  return base
}

const _debug: {
  calls: Array<{ label: string; messages: Array<Record<string, any>> }>
} = {
  calls: [],
}

function makeDebugCallback(label: string): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleChatModelStart(_llm: any, messages: any[][]) {
      _debug.calls.push({
        label,
        messages: messages[0].map(serializeMessageForDebug),
      })
    },
  })
}

// ─────────────────────────────────────────────────────────────
// Cost tracking
// ─────────────────────────────────────────────────────────────

export type TokenUsageEntry = {
  /** Human-readable label, e.g. "phase1-iter-0" or "phase2" */
  label: string
  inputTokens: number
  /** Subset of inputTokens served from cache (prompt-cache hit) */
  cachedTokens: number
  outputTokens: number
  totalTokens: number
  costEur: number
}

export type AgentCostBreakdown = {
  /** One entry per Phase-1 LLM invocation (tool-calling iterations) */
  iterations: TokenUsageEntry[]
  /** The Phase-2 structured final-answer call */
  phase2: TokenUsageEntry
  /** Sum of all above */
  total: TokenUsageEntry
}

/**
 * Converts a LangChain usage_metadata object into a TokenUsageEntry.
 * Falls back to zeroes if the model does not return usage data.
 */
function computeCallCost(label: string, model: ModelName, usageMeta: any): TokenUsageEntry {
  const inputTokens = usageMeta?.input_tokens ?? 0
  const outputTokens = usageMeta?.output_tokens ?? 0
  const cachedTokens = usageMeta?.input_token_details?.cache_read ?? 0
  const totalTokens = usageMeta?.total_tokens ?? inputTokens + outputTokens

  const prices = (
    PRICES as Record<string, { input_cache_miss: number; input_cache_hit: number; output: number }>
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

/**
 * Returns a callback that captures usage_metadata from the raw LLM response.
 * Works with `withStructuredOutput` which returns a plain object — the raw
 * AIMessage (with usage) is captured via the handleLLMEnd hook.
 */
function makeUsageCallback(collector: { usage?: any }): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleLLMEnd(output: any) {
      const msg = output?.generations?.[0]?.[0]?.message
      if (msg?.usage_metadata) collector.usage = msg.usage_metadata
    },
  })
}

/** Sums a list of TokenUsageEntries into a single total entry. */
function sumUsageEntries(entries: TokenUsageEntry[]): TokenUsageEntry {
  return entries.reduce(
    (acc, e) => ({
      label: 'total',
      inputTokens: acc.inputTokens + e.inputTokens,
      cachedTokens: acc.cachedTokens + e.cachedTokens,
      outputTokens: acc.outputTokens + e.outputTokens,
      totalTokens: acc.totalTokens + e.totalTokens,
      costEur: acc.costEur + e.costEur,
    }),
    { label: 'total', inputTokens: 0, cachedTokens: 0, outputTokens: 0, totalTokens: 0, costEur: 0 }
  )
}

// ─────────────────────────────────────────────────────────────
// Model config
// ─────────────────────────────────────────────────────────────

type ModelName = string // e.g. 'gpt-5.1', 'gemini-2.5-flash'
type ModelProvider = 'openai' | 'gemini'

/** Derives the provider from a concrete model name. */
function getProviderFromModel(model: ModelName): ModelProvider {
  return model.startsWith('gemini') ? 'gemini' : 'openai'
}

/**
 * Returns a concrete model name and classification for this request.
 * Curatorial queries (aesthetic evaluation, portfolio critique, etc.) are routed
 * to the OpenAI model; general queries go to the Gemini model.
 * The env var AGENT_MODEL overrides routing entirely when set (e.g. 'gpt-5.1').
 */
async function routeModel(
  message: string,
  queryService: QueryService
): Promise<{ model: ModelName; isCuratorial: boolean }> {
  // Hard override: if the env var is set to a specific model, always use it
  const envOverride = process.env.AGENT_MODEL
  if (envOverride) return { model: envOverride, isCuratorial: false }

  return {
    model: 'gemini-3-flash-preview',
    isCuratorial: false,
  }

  // const isCuratorial = await queryService.classifyCuratorialQuery(message)
  // return {
  //   model: isCuratorial ? 'gpt-5.1' : 'gemini-3-flash-preview',
  //   isCuratorial,
  // }
}

function createChatModel(
  model: ModelName = 'gpt-5.1',
  maxTokensOverride?: number,
  effortOverride?: 'low' | 'medium' | 'high'
) {
  const provider = getProviderFromModel(model)
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
    // maxTokens: maxTokensOverride ?? Number(process.env.AGENT_MAX_TOKENS ?? 1500),
  })
}

// ─────────────────────────────────────────────────────────────
// Structured output schema for the final answer
// Both OpenAI and Gemini support withStructuredOutput with JSON schema.
// The model fills `text` with its response and `photo_ids` with the IDs
// of photos it actually references — preserving its own curation intent.
// ─────────────────────────────────────────────────────────────

const FINAL_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The complete response text to show to the user',
    },
    photo_ids: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'Ordered list of photo IDs to display alongside your response. This field is your primary tool for visual communication: use it not only to reference photos mentioned in your text, but also to express any intentional sequence — a curated ranking, a chronological progression, a before/after pair, a grouped selection, a re-ordered set from photos the user provided, etc. The order you choose IS the message: index 0 is shown first and carries the most visual weight. Leave empty only when no specific photos are relevant.',
    },
  },
  required: ['text', 'photo_ids'],
} as const

// ─────────────────────────────────────────────────────────────
// Redis-backed session store (userId → conversation history)
// ─────────────────────────────────────────────────────────────

const MAX_HISTORY_TURNS = 4 // max user+assistant message pairs kept in memory
const HISTORY_TTL_SECONDS = 7200 // 2 hours sliding TTL

function redisHistoryKey(userId: number): string {
  return `agent:history:${userId}`
}

async function getHistory(userId: number): Promise<ChatMessage[]> {
  try {
    const data = await redis.get(redisHistoryKey(userId))
    return data ? (JSON.parse(data) as ChatMessage[]) : []
  } catch (err) {
    console.warn('[Agent] Failed to read history from Redis', err)
    return []
  }
}

async function setHistory(userId: number, history: ChatMessage[]): Promise<void> {
  try {
    await redis.set(redisHistoryKey(userId), JSON.stringify(history), 'EX', HISTORY_TTL_SECONDS)
  } catch (err) {
    console.warn('[Agent] Failed to write history to Redis', err)
  }
}

async function deleteHistory(userId: number): Promise<void> {
  try {
    await redis.del(redisHistoryKey(userId))
  } catch (err) {
    console.warn('[Agent] Failed to delete history from Redis', err)
  }
}

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
  cost: AgentCostBreakdown
}

// ─────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────

// ## Tool groups
// All available tools belong to one of three groups, indicated by their [TAG] prefix:

// - [BASIC_TOOLS] — For fetching data about user photos and collections: get_photo_info, fetch_collections. get_photo_info MUST be called before discussing any specific photo.

// - [CATALOG_INSIGHT] — Analytical tool that reveals patterns and statistics across the entire catalog: overall_catalog_view. Use this to understand the photographer's overall style, strengths, weaknesses, and catalog overview in a single comprehensive call.

// - [PHOTO_SEARCH] — Tools that find or filter specific photos from the catalog: search_semantic_overall_style, search_semantic_content, filter_photos, find_photos_from_photo.

const SYSTEM_PROMPT = `You are Photoreka's intelligent photo catalog assistant.
You help photographers explore, understand, and get insights from their photo library.

## Behavior
- Be kind, specific and helpful. Summarize key data rather than dumping raw JSON. Aim for responses under 200 words unless the question genuinely requires more depth (e.g. a full catalog critique). Never pad or repeat yourself.
- Always respond in the same language the user writes in (but for some tools you will need english prompts — that's fine, just keep the final output in the user's language).
- Your role is only to assist with Photoreka and you cannot provide any information, advice, or insights that are not directly related to the user's photo catalog and photographic practice. If the user asks for anything outside of that scope, politely decline and steer them back to photography-related topics.
- Internal agent tools are only for your use and should never be mentioned in the final output to the user. The user only can know about Photoreka's features listed on 'app_knowledge' tool.
- At the end of your response, you can suggest concrete next steps or questions the user can ask to explore further, always based on what you can actually do with the tools available to you. Be conservative with suggestions; do not suggest if you are not sure you can do that with the tools.

## Working with photos and scores
- If you need to reference a concrete photo by text, you can use the filename, never the ID.
- Artistic scores are from 0 to 10. Scores >= 7 are considered strong. Use scores for your internal reasoning, but do not mention them unless they are relevant to the user's question. Don't evaluate photos solely based on scores — always consider the actual image/descriptions provided.

## Tool usage
- When you need to use multiple [PHOTO_SEARCH] tools, call them one at a time so you can pass the results of one as candidate_ids to the next, enabling progressive filtering and precise intersection. Never call two search tools in the same step.
- When two or more tools are independent — meaning neither needs the output of the other as input — call them in parallel in the same step. This is preferred over sequential calls when there is no dependency between them.

## CRITICAL — the tool get_photo_info MUST be called before discussing any specific photo
1. The user's message includes attached photo IDs (listed as [Attached photo IDs: ...]). Call get_photo_info with ALL of those IDs as your very first action, before doing anything else.
2. The user references any photo already mentioned in the conversation history — by filename, position ("the first one", "that photo"), pronoun, or any other indirect reference. Call get_photo_info to re-fetch current data; history information about photos is never sufficient.
3. Any time you need to discuss, compare, analyze, or otherwise operate on specific photos for any reason.
NEVER rely on photo information from conversation history alone — always re-fetch via get_photo_info. The only data you can trust from history is photo IDs and filenames.

## Displaying photos
Your final response includes a photo_ids field. Use it to surface the photos you discuss or reference. When the user's request implies a visual result — a ranking, a sorted selection, a before/after, a serie, sequence or curated set — photo_ids is also how you express that result: the client renders photos in exactly the order you provide, so the sequence itself carries meaning. Only omit photo_ids when no specific photos are relevant to the response.`

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
// Phase 2 helper — structured final answer with retry
//
// "Unexpected end of JSON input" in parseJsonMarkdown is caused by truncated
// JSON output. Most likely causes:
//   1. Token limit too tight — multimodal tool-result payloads (images from
//      get_photo_info) leave almost no room for the structured response.
//   2. Transient API / network errors returning an empty or partial body.
//
// Fix: higher fixed token budget (6 000) + up to 3 retries with back-off.
// Same model, same messages, same schema on every attempt — no behaviour change.
// ─────────────────────────────────────────────────────────────

/**
 * Attempts to slim a single ToolMessage to id + originalFileName only.
 * Skips multimodal ToolMessages (content is an array — e.g. get_photo_info with images),
 * since their value lies in the visual data and cannot be summarised as IDs.
 * Returns the original message unchanged on any parse failure.
 */
function slimToolMessage(msg: ToolMessage): ToolMessage {
  // Never compress multimodal content (image arrays from get_photo_info)
  if (Array.isArray(msg.content)) return msg
  try {
    const parsed = JSON.parse(typeof msg.content === 'string' ? msg.content : '{}')
    const photos = parsed.photos ?? parsed.results ?? []
    // Already slim or not a photo payload — leave it
    if (photos.length === 0) return msg
    const slim = {
      totalMatched: parsed.totalMatched ?? parsed.totalFound ?? photos.length,
      photos: photos.map((p: any) => ({ id: p.id, originalFileName: p.originalFileName })),
    }
    return new ToolMessage({ content: JSON.stringify(slim), tool_call_id: msg.tool_call_id })
  } catch {
    return msg
  }
}

/**
 * After pushing a new batch of ToolMessages in Phase 1, compress all *prior*
 * ToolMessages in the messages array (i.e. everything except the last `freshCount`
 * messages). Once the model has acted on a tool result and emitted its next
 * tool_call, the full photo payload is no longer needed — only the IDs remain
 * relevant (as potential candidate_ids). This keeps each successive Phase 1
 * iteration lighter and also reduces Phase 2 input size.
 */
function compressPriorToolMessages(messages: any[], freshCount: number): void {
  const cutoff = messages.length - freshCount
  for (let i = 0; i < cutoff; i++) {
    if (messages[i] instanceof ToolMessage) {
      messages[i] = slimToolMessage(messages[i])
    }
  }
}

/**
 * Final compression pass before Phase 2.
 * By the time this runs, all intermediate ToolMessages are already slim
 * (compressed in-loop by compressPriorToolMessages). This function ensures
 * the very last ToolMessage — the one Phase 2 needs for the final answer —
 * is kept intact, and acts as a safety net for any edge cases.
 */
function compressMessagesForPhase2(messages: any[]): any[] {
  let lastToolIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] instanceof ToolMessage) {
      lastToolIdx = i
      break
    }
  }
  return messages.map((msg, idx) => {
    if (!(msg instanceof ToolMessage)) return msg
    if (idx === lastToolIdx) return msg // keep last ToolMessage full for Phase 2
    return slimToolMessage(msg) // all others: ensure they're slim (likely already are)
  })
}

/** Invokes the structured final-answer model with up to 3 retries.
 *  Uses a 6 000-token budget to prevent JSON truncation. */
async function invokeStructuredFinalAnswer(
  modelName: ModelName,
  messages: any[]
): Promise<{ text: string; photo_ids: number[]; usage?: any }> {
  const MAX_ATTEMPTS = 3
  const TOKEN_BUDGET = 6000
  const model = createChatModel(modelName, TOKEN_BUDGET, 'medium').withStructuredOutput(
    FINAL_ANSWER_SCHEMA
  )

  let lastError: any
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[Agent] 🏁 Phase 2 attempt ${attempt + 1}/${MAX_ATTEMPTS}…`)
      const usageCollector: { usage?: any } = {}
      const result = (await model.invoke(messages, {
        callbacks: [makeDebugCallback('phase2'), makeUsageCallback(usageCollector)],
      })) as { text: string; photo_ids: number[] }
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

// ─────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────

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

  // ───────────────────────────────────────────────────────────
  // Main chat method — manual tool-calling loop (LangChain v1.x)
  // ───────────────────────────────────────────────────────────

  /** Clears the conversation history for a user. */
  public static async clearHistory(userId: number): Promise<void> {
    await deleteHistory(userId)
  }

  // ───────────────────────────────────────────────────────────
  // Builds the HumanMessage for the current turn.
  // If contextPhotoIds are provided, prepends an instruction telling the
  // agent to call get_photo_info on those IDs before doing anything else.
  // ───────────────────────────────────────────────────────────

  private buildCurrentUserMessage(message: string, contextPhotoIds: number[]): HumanMessage {
    if (contextPhotoIds.length === 0) {
      return new HumanMessage(message)
    }
    const prefix = `[Attached photo IDs: ${contextPhotoIds.join(', ')}] You MUST call get_photo_info with these IDs as your first action.\n`
    return new HumanMessage(prefix + message)
  }

  // ───────────────────────────────────────────────────────────
  // Fetches key user attributes and returns a short context paragraph
  // to be appended to the system prompt at runtime.
  // ───────────────────────────────────────────────────────────

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

  // ───────────────────────────────────────────────────────────
  // Builds the full messages array: system prompt + hydrated history + current turn.
  // ───────────────────────────────────────────────────────────

  private buildMessageList(
    history: ChatMessage[],
    currentUserMessage: HumanMessage,
    userContext: string = ''
  ): any[] {
    const systemContent = userContext ? `${SYSTEM_PROMPT}\n\n${userContext}` : SYSTEM_PROMPT
    const messages: any[] = [new SystemMessage(systemContent)]

    for (const m of history) {
      if (typeof m.content !== 'string' || m.content.trim().length === 0) continue

      if (m.role === 'user') {
        // Keep photo-context hint on user messages — it is informational, not a call pattern.
        const photoSuffix =
          m.photoIds && m.photoIds.length > 0 ? `\n[Photo IDs: ${m.photoIds.join(', ')}]` : ''
        messages.push(new HumanMessage(m.content + photoSuffix))
      } else {
        // For assistant turns that surfaced photos, append a note so the model
        // can refer back to which photos it showed in the previous turn.
        // Use a clearly-internal format so the model does not reproduce it verbatim.
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

        // Detect multimodal sentinel from get_photo_info
        let toolMessageContent: string | any[] = result
        try {
          const parsed = JSON.parse(result)
          if (parsed._multimodalContent && Array.isArray(parsed._multimodalContent)) {
            toolMessageContent = parsed._multimodalContent
          }
        } catch {
          // not JSON — use raw string
        }

        return new ToolMessage({ content: toolMessageContent, tool_call_id: tc.id })
      })
    )
  }

  // ───────────────────────────────────────────────────────────
  // Persists a completed turn (user + assistant messages) to the in-memory
  // history, capped at MAX_HISTORY_TURNS pairs. No-ops on empty output.
  // ───────────────────────────────────────────────────────────

  private async persistHistory(
    userId: number,
    history: ChatMessage[],
    message: string,
    contextPhotoIds: number[],
    output: string,
    foundPhotoIds: number[]
  ): Promise<void> {
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
    await setHistory(userId, updatedHistory.slice(-(MAX_HISTORY_TURNS * 2)))
  }

  // ───────────────────────────────────────────────────────────
  // Main chat method — manual tool-calling loop (LangChain v1.x)
  // ───────────────────────────────────────────────────────────

  public async chat(
    userId: number,
    message: string,
    contextPhotoIds: number[] = []
  ): Promise<AgentChatResult> {
    const history: ChatMessage[] = await getHistory(userId)

    const foundPhotoIds: number[] = []
    const { model: modelName, isCuratorial } = await routeModel(message, this.queryService)
    const provider = getProviderFromModel(modelName)
    console.log(`[Agent] 🤖 Routed to model: ${modelName} (${provider.toUpperCase()})`)
    console.log(`[Agent] 🔍 Query classified as: ${isCuratorial ? 'CURATORIAL' : 'GENERAL'}`)
    const tools = this.toolsService.createTools(userId, foundPhotoIds, provider)
    // For Gemini, tool_choice defaults to 'auto', which lets it bypass tool calls entirely
    // and answer the user directly (e.g. "Fetching your collections." with no actual fetch).
    // We create a second binding with tool_choice:'any' to force at least one tool call on
    // the first Phase-1 iteration; subsequent iterations revert to 'auto' so the model can
    // naturally signal it has all the data it needs and exit the loop.
    const modelWithTools = createChatModel(modelName, undefined, 'low').bindTools(tools)
    // const modelWithToolsForced =
    //   provider === 'gemini'
    //     ? createChatModel(modelName, undefined, 'low').bindTools(tools, { tool_choice: 'any' })
    //     : modelWithTools
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
    const userContext = await this.buildUserContext(userId)
    const messages = this.buildMessageList(history, currentUserMessage, userContext)

    const toolsUsed: string[] = []
    const intermediateSteps: IntermediateStep[] = []
    const iterationUsages: TokenUsageEntry[] = []
    const MAX_ITERATIONS = 5
    _debug.calls = []

    console.log(
      `\n[Agent] ▶ Starting | userId=${userId} | message="${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`
    )

    // ── Phase 1: data-fetching loop ─────────────────────────────────────────
    // Run tool calls until the model signals it has all the data it needs.
    // add_photos_to_result is intentionally absent — photo IDs are collected
    // via structured output in Phase 2, preserving the model's own selection.
    let totalIter = 0
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      totalIter = iter + 1
      console.log(`[Agent] 🔄 Iteration ${totalIter}/${MAX_ITERATIONS} — calling model…`)

      // First Gemini iteration: force at least one tool call so it doesn't answer
      // directly without fetching any data. Subsequent iterations use auto so the
      // model can exit the loop once it has everything it needs.
      const activeModel = modelWithTools //iter === 0 ? modelWithToolsForced : modelWithTools
      const response = await activeModel.invoke(messages, {
        callbacks: [makeDebugCallback(`phase1-iter-${iter}`)],
      })
      // Capture token usage for this iteration (available directly on the AIMessage)
      iterationUsages.push(
        computeCallCost(`phase1-iter-${iter}`, modelName, response.usage_metadata)
      )
      const toolCalls = response.tool_calls ?? []

      if (toolCalls.length === 0) {
        // No more tool calls — Phase 2 will generate the final answer from
        // the current messages state (ends at HumanMessage or last ToolMessage).
        // Do NOT push this response: it would leave an AIMessage as the last
        // message, which breaks OpenAI's structured output parsing.
        console.log(`[Agent] ✅ Data phase complete after ${totalIter} iteration(s).`)
        break
      }

      // Strip any intermediate reasoning text from tool-call responses so the
      // final answer is self-contained and not fragmented across turns.
      if (!!extractTextContent(response.content).trim()) {
        console.log(`[Agent]   ℹ️  Stripping intermediate text from tool-call response`)
        messages.push(new AIMessage({ content: '', tool_calls: toolCalls }))
      } else {
        messages.push(response)
      }

      console.log(
        `[Agent] 🔧 Tool calls (${toolCalls.length}): ${toolCalls.map((tc: any) => tc.name).join(', ')}`
      )
      const toolResults = await this.executeToolCalls(
        toolCalls,
        toolMap,
        toolsUsed,
        intermediateSteps
      )
      messages.push(...toolResults)
      // Compress all ToolMessages that pre-date this batch — the model has already
      // acted on them (used IDs as candidate_ids) and no longer needs full photo data.
      compressPriorToolMessages(messages, toolResults.length)
    }

    // ── Phase 2: structured final answer (with retry) ───────────────────────
    // The model produces text + photo_ids in a single structured call.
    // withStructuredOutput ensures the model consciously selects which photos
    // to surface, with no extra round-trips and no side-effect tool needed.
    // invokeStructuredFinalAnswer retries up to 3 times with a 6 000-token
    // budget to prevent JSON truncation errors.
    const structured = await invokeStructuredFinalAnswer(
      modelName,
      compressMessagesForPhase2(messages)
    )
    // Strip any leaked internal-context annotations the model may have echoed.
    const rawOutput = structured.text ?? ''
    const output = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()
    foundPhotoIds.push(...(structured.photo_ids ?? []))

    // ── Build cost breakdown ──────────────────────────────────────────────────
    const phase2Usage = computeCallCost('phase2', modelName, structured.usage)
    const total = sumUsageEntries([...iterationUsages, phase2Usage])
    const cost: AgentCostBreakdown = { iterations: iterationUsages, phase2: phase2Usage, total }

    console.log(
      `[Agent] ✅ Done. Tools used: [${toolsUsed.join(', ') || 'none'}] | Photos: [${foundPhotoIds.join(', ')}]`
    )
    console.log(
      `[Agent] 💰 Cost: €${total.costEur.toFixed(6)} | Tokens in=${total.inputTokens} (cached=${total.cachedTokens}) out=${total.outputTokens}`
    )
    console.log(
      `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"`
    )
    await this.persistHistory(userId, history, message, contextPhotoIds, output, foundPhotoIds)
    return {
      output,
      photoIds: foundPhotoIds,
      toolsUsed,
      intermediateSteps,
      totalIterations: totalIter,
      cost,
    }
  }
}
