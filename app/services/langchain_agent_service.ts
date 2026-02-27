import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService from './agent_tools_service.js'
import QueryService from './query_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import User from '#models/user'
import Photo from '#models/photo'
import PhotoImageService from './photo_image_service.js'
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

/**
 * Collapses a JSON string into a compact one-liner for log previews.
 * Strips all unnecessary whitespace so multi-line payloads never pollute the log.
 */
function compactPreview(json: string, maxLen = 220): string {
  const oneliner = json.replace(/\s+/g, ' ').trim()
  return oneliner.length > maxLen ? `${oneliner.slice(0, maxLen)}…` : oneliner
}

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
// The model fills `text` with its response and `photo_groups` with labelled
// groups of photo IDs — preserving its own curation and grouping intent.
// ─────────────────────────────────────────────────────────────

const FINAL_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The complete response text to show to the user',
    },
    photo_groups: {
      type: 'array',
      description:
        'Grouped photo results. Each group has a descriptive label and an ordered list of photo IDs. ' +
        'Use a SINGLE group with label "result" when the response is a flat list or there is no natural subdivision. ' +
        'Use MULTIPLE groups when the answer benefits from thematic, temporal, or categorical separation ' +
        '(e.g. "Portraits", "Landscapes", "Before / After", "Top picks", "Honorable mentions"). ' +
        "There is NO cost to including photo IDs — include as many as are pertinent to the user's request. " +
        'Order within each group IS your editorial statement: index 0 carries the most visual weight. ' +
        'Leave the array empty only when no specific photos are relevant.',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description:
              'Short, descriptive group name in the user\'s language (e.g. "Retratos", "Paisajes", "result").',
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

// ─────────────────────────────────────────────────────────────
// Redis-backed session store (userId → conversation history)
// ─────────────────────────────────────────────────────────────

const MAX_HISTORY_TURNS = 4 // max user+assistant message pairs kept in memory
const HISTORY_TTL_SECONDS = 7200 // 2 hours sliding TTL
// Total visual budget for Phase 2: user attachments always come first (all of them),
// remaining slots are filled with tool-result photos. Must match `limit` in
// search_advanced (agent_tools_service.ts) so Phase 1 fetches exactly this many photos.
const PHASE2_TOTAL_IMAGE_LIMIT = 20
// Hard cap on total photos (thumbnail + text-only) across all groups in Phase 2.
// Prevents excessive token usage when multiple iterations return large result sets.
const PHASE2_TOTAL_PHOTO_LIMIT = 30

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

// ─────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are Photoreka's intelligent photo assistant.
Help photographers explore and analyze their library with insight and wit.

## Behavior
- **Language:** Always match the user's language. But use English always for internal tool calls.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Stealth:** Never mention tool names or internal IDs to the user.`

// Phase 1 addendum: data-gathering role + curatorial data strategy (which tools to call).
const PHASE1_ROLE_ADDENDUM = `

## Your current role: DATA COLLECTOR
You are in the data-gathering phase. Your ONLY job is to call the right tools to fetch the data the user needs.
- **DO NOT** compose a response, summary, or evaluation of the results.
- **DO NOT** assess whether search results are "good enough" qualitatively — a later phase with visual access to thumbnails handles that.
- **DO re-search** ONLY if there is a clear quantitative gap (e.g. user asked for 5 photos and you got 2).
- When you have all the data you need, call the \`done\` tool to signal completion. You MUST always end by calling \`done\`.

## Search & Tool Strategy
- **Parallelism:** Call independent tools simultaneously in one step.
- **Advanced Search (\`search_advanced\`):**
    - Use for targeted photo searches with specific criteria.
    - Use \`style_query\` for visual style queries (e.g. "dark moody portraits", "high-key minimalism").
    - Use \`content_tags\` for concrete objects/actions/events.
    - Use \`filter\` for metadata, scores, visual aspects, dates.
    - Use \`similar_to\` for finding photos similar to reference photo/s.
    - **Logic:** Use \`intersect\` (AND) for specific requests; \`union\` (OR) for broad inspiration.
    - **Fallback:** If a strict search yields 0 results, retry with another tool/parameter.
    - **NEVER** call more than ONE \`search_advanced\` in the same step — combine criteria within a single call, using intersect/union logic.
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
- Call \`search_advanced\` OR \`catalog_sample\` to find the specific photos relevant to the query. Never call both simultaneously.
- Do NOT attempt to evaluate or score the photos yourself — just gather the data.

## Catalog exploration & evolution questions
For questions about photographic evolution, progress over time, or broad catalog sampling:
- Call \`overall_catalog_view\` AND \`catalog_sample\` in parallel — always both together.
- \`catalog_sample\` returns structured buckets with date ranges and sampled photos per period — use it for temporal cross-sections.
- Use the \`genre\` filter in \`catalog_sample\` to narrow to specific genres (e.g. street photography evolution).
- Do NOT use \`search_advanced\` for exploration/evolution questions — \`catalog_sample\` is the dedicated tool for that.`

// Phase 2 addendum: evaluation criteria, judgment, and communication style.
// Phase 2 has NO access to tools — only to the data already gathered.
const PHASE2_ROLE_ADDENDUM = `

## Curatorial judgment strategy
Evaluate and respond using the data gathered in previous steps, if any.
- **Scoring (1-10):** Use for internal ranking. Only surface scores if the user asks or it adds clear value.
    - *Scale:* 1 (Disastrous), 5 (Acceptable), 7.5 (Remarkable), 10 (Unique).
- **Genre-specific priorities** — weight criteria according to the photographer's preferred style:
    - *Documentary:* \`message\`, \`storytelling\`, \`candidness\`.
    - *Street:* \`candidness\`, \`visual_games\`, \`originality\`.
    - *Artistic:* \`message\`, \`originality\`, \`composition\`.
- **Catalog analysis:** Look for patterns and imbalances across clusters, not just average scores.

## Communication
- **Conciseness:** Max 200 words. No fluff, no raw JSON. Summarize insights unless explicitly asked for details.
- **Paragraphs:** Always split the 'text' field into short, distinct paragraphs (2–4 sentences each). Never write a single continuous block of text. Each paragraph should address one idea: e.g. overall impression → specific highlights → weakness or suggestion.
- **Proactivity:** Suggest 1 concrete next step the user can take within the app.
- **Honesty:** Don't flatter the user or their photos. Be honest, constructive, and insightful — even if that means delivering tough feedback.
- Use filenames for reference in your text, never raw IDs or tool names.
- Respond in the user's language.

## Visual Output — photo_groups
- Always populate \`photo_groups\` when the user expects a visual result (rankings, selections, or sets).
- Use a SINGLE group with label \`"result"\` when the photos form one flat list with no natural subdivision.
- Use MULTIPLE groups when the answer benefits from thematic, temporal, or categorical separation (e.g. \`"Portraits"\`, \`"Landscapes"\`, \`"Top picks"\`, \`"Honorable mentions"\`, \`"Before / After"\`).
- Group labels should be in the user's language and concise.
- The order within each group defines display order and IS your editorial statement (index 0 = most prominent).
- There is NO cost or penalty for including photo IDs — include every photo that is pertinent to the user's request. Be generous, not restrictive.
- Leave \`photo_groups\` empty only when no specific photos are relevant.`

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
 * Slims a ToolMessage to id + originalFileName only.
 * Used to compress older tool results that the model has already acted on.
 * Returns the original message unchanged on any parse failure.
 *
 * Handles two payload shapes:
 *   - get_photo_info:   raw array  [{id, originalFileName, story, …}, …]
 *   - search_advanced:  {photos: [{id, originalFileName, genre}, …], returned, …}
 *
 * Non-photo tools (overall_catalog_view, app_knowledge, fetch_collections, done) are
 * always preserved in full — their content is needed by Phase 2 as context.
 */
/** Tools whose full payload must survive compression (not photo-list tools). */
const NON_PHOTO_TOOLS = new Set([
  'overall_catalog_view',
  'app_knowledge',
  'fetch_collections',
  'catalog_sample',
  'done',
])

function slimToolMessage(msg: ToolMessage): ToolMessage {
  if (typeof msg.content !== 'string') return msg
  // Explicitly preserve tools that carry non-photo context (catalog analysis, etc.)
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

/**
 * After pushing a new batch of ToolMessages in Phase 1, compress all *prior*
 * ToolMessages in the messages array (i.e. everything except the last `freshCount`
 * messages). Phase 1 is text-only, so no image handling is needed.
 */
function compressPriorToolMessages(messages: any[], freshCount: number): void {
  const cutoff = messages.length - freshCount
  for (let i = cutoff - 1; i >= 0; i--) {
    if (messages[i] instanceof ToolMessage) {
      messages[i] = slimToolMessage(messages[i])
    }
  }
}

/**
 * Final compression pass before Phase 2.
 * Phase 2 receives visual context exclusively via dedicated HumanMessages
 * (user attachments + top tool results) — each with interleaved description + thumbnail.
 * All ToolMessages are slimmed to id+filename only: the visual HumanMessages already
 * carry the full text descriptions for the photos shown, so keeping full ToolMessage
 * payloads would only duplicate tokens without adding information.
 *
 * Also swaps the system prompt from Phase 1 (data collector) to Phase 2 (curator/judge).
 */
function compressMessagesForPhase2(messages: any[], userContext: string = ''): any[] {
  return messages.map((msg, idx) => {
    // Swap system prompt: replace Phase 1 role with Phase 2 role
    if (idx === 0 && msg instanceof SystemMessage) {
      const phase2Prompt = SYSTEM_PROMPT_BASE + PHASE2_ROLE_ADDENDUM
      const content = userContext ? `${phase2Prompt}\n\n${userContext}` : phase2Prompt
      return new SystemMessage(content)
    }
    if (!(msg instanceof ToolMessage)) return msg
    return slimToolMessage(msg) // all tool results: id+filename only
  })
}

// ─────────────────────────────────────────────────────────────
// Phase 2 visual context — extract photo IDs from ALL tool results
// ─────────────────────────────────────────────────────────────

type PhotoIdGroup = {
  tool: string
  ids: number[]
  /** Index in intermediateSteps — later = more recent */
  stepIndex: number
}

/**
 * Scans ALL intermediateSteps and collects photo IDs from every photo-returning
 * tool call (search_advanced, catalog_sample, get_photo_info), preserving order.
 * Returns groups sorted chronologically (earliest first, most recent last).
 * Phase 2 uses the most recent group for thumbnails and earlier groups for text-only context.
 */
function extractAllPhotoIdsGrouped(steps: IntermediateStep[]): PhotoIdGroup[] {
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

    // Skip non-photo tools (overall_catalog_view, app_knowledge, fetch_collections)
  }
  return groups
}

// Appended as the last message in Phase 2 to give the model an explicit
// "judge" role: synthesise from gathered data, be selective, curate.
const PHASE2_SYNTHESIS_PROMPT = `Now produce your final response to the user.

You have gathered all the data you need in the previous steps. You also have visual access to thumbnail images — each paired with its full description — for the user's attached photos and the top search results (if any). Use them for visual verification and curatorial judgment.

Act as a discerning curator:
- For searching/curating photos: only include photos in \`photo_groups\` that genuinely match the user's request or add clear value to your answer. Discard any that are tangential, redundant, or low relevance — even if they were returned by a search tool.
- Organize results into \`photo_groups\`: use a single group labeled \"result\" for flat lists, or multiple groups when the answer benefits from thematic/temporal/categorical separation (e.g. \"Portraits\", \"Landscapes\", \"Top picks\", etc.).
- Group labels should be in the user's language and concise.
- Order within each group deliberately: the sequence IS your editorial statement (best first, chronological, etc.).
- There is NO cost or limit to including photo IDs — include every pertinent photo. Be generous.
- You may have received photos with thumbnails (for visual evaluation) AND photos with text-only descriptions (from earlier search iterations). Both are valid candidates for your \`photo_groups\` — use thumbnail photos for visual judgment, and text-described photos when their metadata clearly fits the request.
- Keep \`text\` concise and insightful (max 200 words). Do not list raw filenames or IDs in the text.
- **Structure \`text\` as multiple short paragraphs** (2–4 sentences each, separated by a blank line). Never write a single unbroken block of prose. Each paragraph should cover one distinct idea (e.g. overall impression, specific highlights, weakness or pattern, actionable suggestion).
- Respond in the user's language.`

/** Invokes the structured final-answer model with up to 3 retries.
 *  Uses a 6 000-token budget to prevent JSON truncation. */
async function invokeStructuredFinalAnswer(
  modelName: ModelName,
  messages: any[]
): Promise<{
  text: string
  photo_groups: Array<{ label: string; photo_ids: number[] }>
  usage?: any
}> {
  const MAX_ATTEMPTS = 3
  const TOKEN_BUDGET = 6000
  const model = createChatModel(modelName, TOKEN_BUDGET, 'medium').withStructuredOutput(
    FINAL_ANSWER_SCHEMA
  )

  // Append the synthesis prompt as the final message so the model knows
  // it is in the "judge" role and should not expect more tool results.
  const phase2Messages = [...messages, new HumanMessage(PHASE2_SYNTHESIS_PROMPT)]

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
    // Informational only — get_photo_info is pre-fetched programmatically before Phase 1.
    const prefix = `[Attached photo IDs: ${contextPhotoIds.join(', ')}]\n`
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

  // ───────────────────────────────────────────────────────────
  // Builds the full messages array: system prompt + hydrated history + current turn.
  // ───────────────────────────────────────────────────────────

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
  // Builds visual context HumanMessages for Phase 2 (the judge).
  // Returns 0–2 HumanMessages with interleaved description + thumbnail:
  //   1. User's attached photos (ALL of them, up to PHASE2_TOTAL_IMAGE_LIMIT)
  //   2. Top tool results (remaining slots: PHASE2_TOTAL_IMAGE_LIMIT − attached count)
  // Each photo gets its full text description followed by its thumbnail
  // image, so the model has perfect text↔image association.
  // ───────────────────────────────────────────────────────────

  private async buildPhase2VisualContext(
    contextPhotoIds: number[],
    intermediateSteps: IntermediateStep[],
    provider: ModelProvider
  ): Promise<HumanMessage[]> {
    const result: HumanMessage[] = []
    const photoImageService = PhotoImageService.getInstance()

    /**
     * Fetches photos and builds interleaved content parts: text description + thumbnail per photo.
     * Returns the content parts array and the count of successfully fetched photos.
     */
    const fetchInterleavedParts = async (
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

        // Full text description for Phase 2 curatorial judgment — includes
        // all metadata fields the judge needs (scores, visual aspects, EXIF, etc.)
        const descriptions = photo.descriptions || {}
        const fullData = {
          id: photo.id,
          originalFileName: photo.originalFileName,
          story: descriptions.story || null,
          context: descriptions.context || null,
          artistic_scores: descriptions.artistic_scores || null,
        }
        parts.push({
          type: 'text',
          text: `[Photo ID ${photo.id} — ${photo.originalFileName}]\n${JSON.stringify(fullData, null, 2)}`,
        })

        // Thumbnail image
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

    /**
     * Fetches photos and builds text-only content parts (no thumbnails).
     * Used for photos from earlier iterations that exceed the image budget.
     */
    const fetchTextOnlyParts = async (photoIds: number[]): Promise<any[]> => {
      if (photoIds.length === 0) return []
      const photos = await this.photoManager.getPhotosByIds(photoIds)
      const photoMap = new Map(photos.map((p) => [p.id, p]))
      const parts: any[] = []

      for (const id of photoIds) {
        const photo = photoMap.get(id)
        if (!photo) continue

        const descriptions = photo.descriptions || {}
        const fullData = {
          id: photo.id,
          originalFileName: photo.originalFileName,
          story: descriptions.story || null,
          context: descriptions.context || null,
          artistic_scores: descriptions.artistic_scores || null,
        }
        parts.push({
          type: 'text',
          text: `[Photo ID ${photo.id} — ${photo.originalFileName} (text-only, no thumbnail)]\n${JSON.stringify(fullData, null, 2)}`,
        })
      }
      return parts
    }

    // 1. User's attached photos — always include all of them (up to total budget)
    if (contextPhotoIds.length > 0) {
      const { parts, count } = await fetchInterleavedParts(
        contextPhotoIds,
        PHASE2_TOTAL_IMAGE_LIMIT
      )
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

    // 2. Tool result photos from ALL iterations
    //    Most recent group gets thumbnail+text (visual budget), earlier groups get text-only.
    const allGroups = extractAllPhotoIdsGrouped(intermediateSteps)
    const attachedSet = new Set(contextPhotoIds)
    let remainingImageSlots = Math.max(
      0,
      PHASE2_TOTAL_IMAGE_LIMIT - Math.min(contextPhotoIds.length, PHASE2_TOTAL_IMAGE_LIMIT)
    )
    // Total photo budget (thumbnail + text-only) for tool results, excluding user attachments
    let remainingPhotoSlots = Math.max(
      0,
      PHASE2_TOTAL_PHOTO_LIMIT - Math.min(contextPhotoIds.length, PHASE2_TOTAL_PHOTO_LIMIT)
    )

    if (allGroups.length > 0) {
      // Log overview of all groups
      console.log(
        `[Agent] 👁️  Phase 2 visual context: ${allGroups.length} photo group(s) from tool results:`
      )
      for (const g of allGroups) {
        console.log(
          `[Agent]     📦 ${g.tool} (step ${g.stepIndex}): ${g.ids.length} photo(s) → [${g.ids.slice(0, 8).join(', ')}${g.ids.length > 8 ? ', …' : ''}]`
        )
      }

      // Process groups in reverse order (most recent first) for thumbnail priority
      const reversedGroups = [...allGroups].reverse()

      for (const group of reversedGroups) {
        if (remainingPhotoSlots <= 0) break

        const groupIds = group.ids.filter((id) => !attachedSet.has(id))
        if (groupIds.length === 0) continue

        // Cap this group to remaining total photo budget
        const cappedGroupIds = groupIds.slice(0, remainingPhotoSlots)

        if (remainingImageSlots > 0) {
          // This group gets thumbnails (up to remaining budget)
          const withImageIds = cappedGroupIds.slice(0, remainingImageSlots)
          const textOnlyIds = cappedGroupIds.slice(remainingImageSlots)

          const { parts: imageParts, count: imageCount } = await fetchInterleavedParts(
            withImageIds,
            remainingImageSlots
          )

          // Text-only for overflow within this group
          const textParts = await fetchTextOnlyParts(textOnlyIds)

          const allParts = [...imageParts, ...textParts]
          if (allParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${imageCount} photo(s) with thumbnail + ${textOnlyIds.length} text-only]`,
                  },
                  ...allParts,
                ],
              })
            )
            console.log(
              `[Agent] 👁️  Phase 2 — ${group.tool} (step ${group.stepIndex}): ${imageCount} with thumbnail, ${textOnlyIds.length} text-only`
            )
          }
          remainingImageSlots -= imageCount
          remainingPhotoSlots -= cappedGroupIds.length
        } else {
          // No image budget left — all text-only
          const textParts = await fetchTextOnlyParts(cappedGroupIds)
          if (textParts.length > 0) {
            result.push(
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: `[${group.tool} results — ${cappedGroupIds.length} photo(s), text-only descriptions (from earlier iteration)]`,
                  },
                  ...textParts,
                ],
              })
            )
            console.log(
              `[Agent] 👁️  Phase 2 — ${group.tool} (step ${group.stepIndex}): ${cappedGroupIds.length} text-only (no image budget)`
            )
          }
          remainingPhotoSlots -= cappedGroupIds.length
        }

        // Add these IDs to the attached set so they're not duplicated
        for (const id of cappedGroupIds) attachedSet.add(id)
      }
    }

    return result
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
    const results = await Promise.all(
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

    return results
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
    photoGroups: PhotoGroup[]
  ): Promise<void> {
    if (!output.trim()) return
    // Flat list for backward-compatible history annotations
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

    // ── Signal tool: `done` ────────────────────────────────────────────────
    // Lightweight tool the model calls to exit the Phase 1 loop.
    // Combined with tool_choice:'any', this makes phantom text structurally
    // impossible: the model MUST call a tool on every iteration.
    const doneTool = tool(async () => 'ok', {
      name: 'done',
      description:
        'Signal that data collection is complete. Call this (alone) when you have gathered all the information needed to answer the user. Do NOT call any other tool in the same step as done.',
      schema: z.object({}),
    })
    const allTools = [...tools, doneTool]

    // tool_choice 'any' forces the model to always call at least one tool,
    // preventing free-text responses (phantom text). The model exits the loop
    // by calling `done`. Works for both OpenAI and Gemini providers.
    const modelWithTools = createChatModel(modelName, undefined, 'low').bindTools(allTools, {
      tool_choice: 'any',
    })
    const toolMap = Object.fromEntries(allTools.map((t) => [t.name, t]))

    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
    const userContext = await this.buildUserContext(userId)
    const messages = this.buildMessageList(history, currentUserMessage, userContext)

    const toolsUsed: string[] = []
    const intermediateSteps: IntermediateStep[] = []
    const iterationUsages: TokenUsageEntry[] = []
    const MAX_ITERATIONS = 3
    _debug.calls = []

    console.log(
      `\n[Agent] ▶ Starting | userId=${userId} | message="${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`
    )

    // ── Pre-fetch attached photos (text only) ────────────────────────────────
    // When the user attaches photos, call get_photo_info programmatically and
    // inject the AIMessage + ToolMessage pair directly into the message history.
    // The model sees the call as already resolved — no iteration wasted, and no
    // temptation to repeat it. The [Attached photo IDs] prefix on the HumanMessage
    // is kept as an informational reference for future history turns.
    //
    // Phase 1 is text-only — no images. Thumbnail images are injected exclusively
    // in Phase 2 (buildPhase2VisualContext) where the judge can use them for
    // visual verification alongside each photo's full text description.
    if (contextPhotoIds.length > 0) {
      const prefetchCallId = `prefetch-get_photo_info-${Date.now()}`
      const prefetchToolCall = {
        name: 'get_photo_info',
        args: { photoIds: contextPhotoIds },
        id: prefetchCallId,
      }
      console.log(
        `[Agent] 📎 Pre-fetching ${contextPhotoIds.length} attached photo(s) (text only)…`
      )
      const prefetchToolMsgs = await this.executeToolCalls(
        [prefetchToolCall],
        toolMap,
        toolsUsed,
        intermediateSteps
      )
      messages.push(
        new AIMessage({ content: '', tool_calls: [prefetchToolCall] }),
        ...prefetchToolMsgs
      )
    }

    // ── Phase 1: data-fetching loop ─────────────────────────────────────────
    // tool_choice:'any' forces a tool call every iteration.
    // The model calls `done` to signal it has all the data it needs.
    let totalIter = 0
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      totalIter = iter + 1
      console.log(`[Agent] 🔄 Iteration ${totalIter}/${MAX_ITERATIONS} — calling model…`)

      const response = await modelWithTools.invoke(messages, {
        callbacks: [makeDebugCallback(`phase1-iter-${iter}`)],
      })
      // Capture token usage for this iteration (available directly on the AIMessage)
      iterationUsages.push(
        computeCallCost(`phase1-iter-${iter}`, modelName, response.usage_metadata)
      )
      const toolCalls = response.tool_calls ?? []

      // Check if the model called `done` (exit signal)
      const calledDone = toolCalls.some((tc: any) => tc.name === 'done')
      // Separate real tool calls from the `done` signal
      const realToolCalls = toolCalls.filter((tc: any) => tc.name !== 'done')

      // Log any phantom text that slipped through despite tool_choice:'any'
      const phantomText = extractTextContent(response.content).trim()
      if (phantomText) {
        const phantomTokenEstimate = Math.ceil(phantomText.length / 4)
        console.warn(
          `[Agent] 👻 PHANTOM TEXT in Phase 1 iter ${totalIter}: ` +
            `~${phantomTokenEstimate} tokens wasted | ` +
            `Preview: "${phantomText.slice(0, 300)}${phantomText.length > 300 ? '…' : ''}"`
        )
      }

      if (calledDone && realToolCalls.length === 0) {
        // Pure done signal — no real tools called, just exit.
        // Do NOT push the response: the last message stays as HumanMessage or ToolMessage
        // which is what Phase 2 expects.
        console.log(`[Agent] ✅ Data phase complete after ${totalIter} iteration(s) (done signal).`)
        break
      }

      // Defensive fallback: tool_choice:'any' should prevent this, but if the
      // model returns 0 tool calls, treat it as an implicit done.
      if (toolCalls.length === 0) {
        console.warn(
          `[Agent] ⚠️  No tool calls returned despite tool_choice:'any' — treating as done.`
        )
        break
      }

      // Execute real tool calls (ignore `done` — it's just a signal)
      if (realToolCalls.length > 0) {
        // Strip any text content from the AIMessage to keep Phase 1 text-free
        messages.push(new AIMessage({ content: '', tool_calls: toolCalls }))

        console.log(
          `[Agent] 🔧 Tool calls (${realToolCalls.length}): ${realToolCalls.map((tc: any) => tc.name).join(', ')}${calledDone ? ' + done' : ''}`
        )

        // We must respond to ALL tool_calls (including done) to keep the message
        // sequence valid for the provider. Execute real tools; reply 'ok' for done.
        const allToolMsgs = await Promise.all(
          toolCalls.map(async (tc: any) => {
            if (tc.name === 'done') {
              return new ToolMessage({ content: 'ok', tool_call_id: tc.id })
            }
            // Execute real tool
            const results = await this.executeToolCalls([tc], toolMap, toolsUsed, intermediateSteps)
            return results[0]
          })
        )
        const freshMessageCount = allToolMsgs.length
        messages.push(...allToolMsgs)
        compressPriorToolMessages(messages, freshMessageCount)
      }

      if (calledDone) {
        console.log(
          `[Agent] ✅ Data phase complete after ${totalIter} iteration(s) (done + tools).`
        )
        break
      }
    }

    // ── Phase 2: structured final answer (with retry) ───────────────────────
    // The model produces text + photo_groups in a single structured call.
    // withStructuredOutput ensures the model consciously selects which photos
    // to surface, with no extra round-trips and no side-effect tool needed.
    // invokeStructuredFinalAnswer retries up to 3 times with a 6 000-token
    // budget to prevent JSON truncation errors.
    //
    // Visual context: the judge receives interleaved description + thumbnail for:
    //   1. User's attached photos (all of them, up to PHASE2_TOTAL_IMAGE_LIMIT = 20)
    //   2. Top tool results (remaining slots up to PHASE2_TOTAL_IMAGE_LIMIT = 20 total)
    // These are injected as dedicated HumanMessages after the compressed
    // conversation and before the synthesis prompt.
    // All ToolMessages are slimmed to id+filename only — full descriptions
    // are already included in the visual HumanMessages, so no duplication.
    const compressedMessages = compressMessagesForPhase2(messages, userContext)
    const phase2VisualContext = await this.buildPhase2VisualContext(
      contextPhotoIds,
      intermediateSteps,
      provider
    )
    const structured = await invokeStructuredFinalAnswer(modelName, [
      ...compressedMessages,
      ...phase2VisualContext,
    ])
    // Strip any leaked internal-context annotations the model may have echoed.
    const rawOutput = structured.text ?? ''
    const output = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()

    // Convert structured photo_groups to typed PhotoGroup[]
    const photoGroups: PhotoGroup[] = (structured.photo_groups ?? []).map((g) => ({
      label: g.label,
      photoIds: g.photo_ids ?? [],
    }))
    // Flat list of all photo IDs across groups (for history context & logging)
    const allPhotoIds = photoGroups.flatMap((g) => g.photoIds)
    foundPhotoIds.push(...allPhotoIds)

    // ── Build cost breakdown ──────────────────────────────────────────────────
    const phase2Usage = computeCallCost('phase2', modelName, structured.usage)
    const total = sumUsageEntries([...iterationUsages, phase2Usage])
    const cost: AgentCostBreakdown = { iterations: iterationUsages, phase2: phase2Usage, total }

    console.log(
      `[Agent] ✅ Done. Tools used: [${toolsUsed.join(', ') || 'none'}] | Photo groups: ${photoGroups.length} (${allPhotoIds.length} total IDs)`
    )
    console.log(
      `[Agent] 💰 Cost: €${total.costEur.toFixed(6)} | Tokens in=${total.inputTokens} (cached=${total.cachedTokens}) out=${total.outputTokens}`
    )
    console.log(
      `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"`
    )
    await this.persistHistory(userId, history, message, contextPhotoIds, output, photoGroups)
    return {
      output,
      photoGroups,
      toolsUsed,
      intermediateSteps,
      totalIterations: totalIter,
      cost,
    }
  }
}
