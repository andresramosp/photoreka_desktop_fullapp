// @ts-nocheck
import { ChatOpenAI } from '@langchain/openai'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import PhotoManager from '../managers/photo_manager.js'
import SearchTextService from './search_text_service.js'
import AgentToolsService from './agent_tools_service.js'

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

const SYSTEM_PROMPT = `You are Photoreka's intelligent photo catalog assistant. 
You help photographers explore, understand, and get insights from their photo library.

Guidelines:
- You can chain multiple tools in one turn when it helps answer the question better.
- Be concise, specific and helpful. Summarize key data rather than dumping raw JSON.
- If you need to reference a concrete photo by text, you can use the filename, never the ID.
- Artistic scores are from 0 to 10. Scores >= 7 are considered strong. Use scores for your internal reasoning, but do not mention them unless they are relevant to the user's question.
- Always respond in the same language the user writes in (but for some tools you will need english prompts — that's fine, just keep the final output in the user's language).
- Be kind and helpful. At the end of your response, you can suggest concrete next steps or questions the user can ask to explore further, always based on what you can actually do with the tools available to you.

CRITICAL — two tools are ALWAYS required together whenever you reference specific photos (no exceptions):

A) get_photo_info — MUST be called first, before discussing any photo:
1. The user's message includes attached photo IDs (listed as [Attached photo IDs: ...]). Call get_photo_info with ALL of those IDs as your very first action, before doing anything else.
2. The user references any photo already mentioned in the conversation history — by filename, position ("the first one", "that photo"), pronoun, or any other indirect reference. Call get_photo_info to re-fetch current data; history information about photos is never sufficient.
3. Any time you need to discuss, compare, analyze, or otherwise operate on specific photos for any reason.
NEVER rely on photo information from conversation history alone — always re-fetch via get_photo_info. The only data you can trust from history is photo IDs and filenames, which you use as input to get_photo_info.

B) add_photos_to_result — MUST be called every single time you mention or reference specific photos in your response, without exception. If you describe a photo, compare photos, answer a question about a photo, or reference any photo in any way, you MUST call add_photos_to_result with those photo IDs. Skipping this call means the user will not see the photos you are talking about, which breaks the experience entirely. There is no scenario where you talk about specific photos without calling add_photos_to_result.`

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
  private toolsService: AgentToolsService

  constructor() {
    this.photoManager = new PhotoManager()
    this.searchService = new SearchTextService()
    this.toolsService = new AgentToolsService(this.photoManager, this.searchService)
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
        // For assistant turns that surfaced photos, reconstruct the proper
        // tool-call / tool-result exchange so the model learns the correct
        // pattern from history instead of reproducing a "[Photo IDs: …]" text
        // suffix in its own output.
        if (m.photoIds && m.photoIds.length > 0) {
          const toolCallId = `hist_apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
          messages.push(
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: toolCallId,
                  name: 'add_photos_to_result',
                  args: { photo_ids: m.photoIds },
                },
              ],
            })
          )
          messages.push(
            new ToolMessage({
              content: JSON.stringify({ added: m.photoIds.length }),
              tool_call_id: toolCallId,
            })
          )
        }
        messages.push(new AIMessage(m.content))
      }
    }

    messages.push(currentUserMessage)
    return messages
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

    let debugHistory =
      `[Agent] 📚 Session history (${history.length} messages):\n` +
      (history.length === 0
        ? '  (empty)'
        : history
            .map(
              (m, i) =>
                `  [${i}] ${m.role.toUpperCase()}: "${m.content.slice(0, 120)}${m.content.length > 120 ? '…' : ''}"` +
                (m.photoIds?.length ? ` [photoIds: ${m.photoIds.join(', ')}]` : '')
            )
            .join('\n'))

    const foundPhotoIds: number[] = []
    const provider = (process.env.AGENT_PROVIDER ?? 'openai') as ModelProvider
    const tools = this.toolsService.createTools(userId, foundPhotoIds, provider)
    const modelWithTools = createChatModel().bindTools(tools)
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]))

    const currentUserMessage = this.buildCurrentUserMessage(message, contextPhotoIds)
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
