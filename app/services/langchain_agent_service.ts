import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService from './agent_tools_service.js'
import QueryService from './query_service.js'

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
 * Returns a concrete model name to use for this request.
 * Curatorial queries (aesthetic evaluation, portfolio critique, etc.) are routed
 * to the OpenAI model; general queries go to the Gemini model.
 * The env var AGENT_MODEL overrides routing entirely when set (e.g. 'gpt-5.1').
 */
async function routeModel(message: string, queryService: QueryService): Promise<ModelName> {
  // Hard override: if the env var is set to a specific model, always use it
  const envOverride = process.env.AGENT_MODEL
  if (envOverride) return envOverride

  const isCuratorial = await queryService.classifyCuratorialQuery(message)
  return isCuratorial
    ? (process.env.OPENAI_CHAT_MODEL ?? 'gemini-2.5-flash')
    : (process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash')
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
// In-memory session store (userId → conversation history)
// ─────────────────────────────────────────────────────────────

const sessionHistories = new Map<number, ChatMessage[]>()
const MAX_HISTORY_TURNS = 4 // max user+assistant message pairs kept in memory

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

// ## Tool groups
// All available tools belong to one of three groups, indicated by their [TAG] prefix:

// - [BASIC_TOOLS] — For fetching data about user photos and collections: get_photo_info, fetch_collections. get_photo_info MUST be called before discussing any specific photo.

// - [CATALOG_INSIGHT] — Analytical tool that reveals patterns and statistics across the entire catalog: overall_catalog_view. Use this to understand the photographer's overall style, strengths, weaknesses, and catalog overview in a single comprehensive call.

// - [PHOTO_SEARCH] — Tools that find or filter specific photos from the catalog: search_semantic_overall_style, search_semantic_content, filter_photos, find_photos_from_photo.

const SYSTEM_PROMPT = `You are Photoreka's intelligent photo catalog assistant.
You help photographers explore, understand, and get insights from their photo library.

## Guidelines
- You can chain multiple tools in one turn when it helps answer the question better.
- Be kind, specific and helpful. Summarize key data rather than dumping raw JSON. Aim for responses under 200 words unless the question genuinely requires more depth (e.g. a full catalog critique). Never pad or repeat yourself.
- If you need to reference a concrete photo by text, you can use the filename, never the ID.
- Artistic scores are from 0 to 10. Scores >= 7 are considered strong. Use scores for your internal reasoning, but do not mention them unless they are relevant to the user's question. Don't evaluate photos solely based on scores — always consider the actual image/descriptions provided.
- Always respond in the same language the user writes in (but for some tools you will need english prompts — that's fine, just keep the final output in the user's language).
- Your role is only to assist with Photoreka and you cannot provide any information, advice, or insights that are not directly related to the user's photo catalog and photographic practice. If the user asks for anything outside of that scope, politely decline and steer them back to photography-related topics. 
- Internal agent tools are only for your use and should never be mentioned in the final output to the user. The user only can know about Photoreka's features listed on 'app_knowledge' tool.
- At the end of your response, you can suggest concrete next steps or questions the user can ask to explore further, always based on what you can actually do with the tools available to you. Be conservative with suggestions; do not suggest if you are not sure you can do that with the tools.

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

  /** Clears the in-memory conversation history for a user. */
  public static clearHistory(userId: number): void {
    sessionHistories.delete(userId)
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
  // Builds the full messages array: system prompt + hydrated history + current turn.
  // ───────────────────────────────────────────────────────────

  private buildMessageList(history: ChatMessage[], currentUserMessage: HumanMessage): any[] {
    const messages: any[] = [new SystemMessage(SYSTEM_PROMPT)]

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
    const modelName = await routeModel(message, this.queryService)
    const provider = getProviderFromModel(modelName)
    console.log(`[Agent] 🤖 Routed to model: ${modelName} (${provider.toUpperCase()})`)
    console.log(
      `[Agent] 🔍 Query classified as: ${provider === 'openai' ? 'CURATORIAL' : 'GENERAL'}`
    )
    const tools = this.toolsService.createTools(userId, foundPhotoIds, provider)
    // For Gemini, tool_choice defaults to 'auto', which lets it bypass tool calls entirely
    // and answer the user directly (e.g. "Fetching your collections." with no actual fetch).
    // We create a second binding with tool_choice:'any' to force at least one tool call on
    // the first Phase-1 iteration; subsequent iterations revert to 'auto' so the model can
    // naturally signal it has all the data it needs and exit the loop.
    const modelWithTools = createChatModel(modelName, undefined, 'low').bindTools(tools)
    const modelWithToolsForced =
      provider === 'gemini'
        ? createChatModel(modelName, undefined, 'low').bindTools(tools, { tool_choice: 'any' })
        : modelWithTools
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
    const messages = this.buildMessageList(history, currentUserMessage)

    const toolsUsed: string[] = []
    const intermediateSteps: IntermediateStep[] = []
    const MAX_ITERATIONS = 5

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
      const activeModel = iter === 0 ? modelWithToolsForced : modelWithTools
      const response = await activeModel.invoke(messages)
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
    }

    // ── Phase 2: structured final answer ─────────────────────────────────────
    // The model produces text + photo_ids in a single structured call.
    // withStructuredOutput ensures the model consciously selects which photos
    // to surface, with no extra round-trips and no side-effect tool needed.
    console.log(`[Agent] 🏁 Requesting structured final answer…`)
    // Use a higher token budget for Phase 2 — the structured output wraps the
    // entire response in JSON, so it needs more room than the data-fetching calls.
    const finalAnswerModel = createChatModel(modelName, 3000, 'medium').withStructuredOutput(
      FINAL_ANSWER_SCHEMA
    )
    const structured = (await finalAnswerModel.invoke(messages)) as {
      text: string
      photo_ids: number[]
    }
    // Strip any leaked internal-context annotations the model may have echoed.
    const rawOutput = structured.text ?? ''
    const output = rawOutput.replace(/\[(?:Shown photos|INTERNAL_CONTEXT)[^\]]*\]\s*/gi, '').trim()
    foundPhotoIds.push(...(structured.photo_ids ?? []))

    console.log(
      `[Agent] ✅ Done. Tools used: [${toolsUsed.join(', ') || 'none'}] | Photos: [${foundPhotoIds.join(', ')}]`
    )
    console.log(
      `[Agent] 📤 Output preview: "${output.slice(0, 200)}${output.length > 200 ? '…' : ''}"`
    )
    this.persistHistory(userId, history, message, contextPhotoIds, output, foundPhotoIds)
    return {
      output,
      photoIds: foundPhotoIds,
      toolsUsed,
      intermediateSteps,
      totalIterations: totalIter,
    }
  }
}
