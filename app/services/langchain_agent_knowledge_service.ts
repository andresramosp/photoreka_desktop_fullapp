/**
 * LangchainAgentKnowledgeService
 *
 * Fast-path agent for users with no analyzed photos.
 * Skips Phase 1 tool orchestration entirely and responds directly,
 * with full app knowledge injected as static text in the system prompt.
 *
 * Routed from ChatController when analyzedCount === 0.
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { APP_KNOWLEDGE_SECTIONS } from '../utils/app_knowledge_content.js'
import User from '#models/user'
import Photo from '#models/photo'
import ConversationService from './conversation_service.js'
import { PRICES, USD_TO_EUR } from './models_service.js'
import type {
  AgentChatResult,
  AgentCostBreakdown,
  TokenUsageEntry,
  ChatMessage,
} from './langchain_agent_service.js'
import { makeDebugCallback, makeUsageCallback } from '../utils/agent_utils.js'

type ChatIntelligenceMode = {
  id: string
  modelPhase2Lite: string
}

const MAX_TOKENS = 1200
const MAX_ATTEMPTS = 2

// ── Prompts ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are Photoreka's intelligent photo assistant.
Help photographers explore and analyze their library with insight and wit.

## Behavior
- **Language:** Always match the user's language.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Grounding:** NEVER fabricate photo filenames, descriptions, scores, or content.

## Response Format
- **Paragraphs:** Split the text into short, distinct paragraphs (2–4 sentences each). Never a single continuous block. Each paragraph = one idea.
- **Conciseness:** Max 200 words. No fluff, no repetition.
- **Structure:** Opening context → key insight → closing suggestion (if applicable).
- **Formatting:** Use **bold** for feature names, key concepts, and important terms. Use sparingly — only for genuinely important words, not decoration.`

function buildRoleAddendum(photoCount: number, analyzedCount: number): string {
  if (analyzedCount > 0) {
    return `

## Your current role: KNOWLEDGE ASSISTANT (catalog active)
You are a **knowledge-only** help assistant for Photoreka. You are NOT the full photo assistant.
The user has ${analyzedCount} analyzed photo(s) (out of ${photoCount} total) in their catalog.
- You do NOT have access to their photos, scores, descriptions, or any catalog data.
- Always return an empty photo_groups array.
- The full photo assistant — which can search, display, rank, and analyze photos — is available at {url:/chat-lab}.

Your job:
1. Answer questions about Photoreka's features and how to use them, using the app knowledge provided below.
2. For ANY photo-related request (searching, displaying, scoring, browsing, finding duplicates, etc.) redirect the user to the full photo assistant: {url:/chat-lab}
3. NEVER fabricate photo filenames, scores, descriptions, or any catalog content.
4. Be clear about what you can and cannot do: you answer "how does this feature work?" questions, not "show me my photos" requests.`
  }

  if (photoCount === 0) {
    return `

## Your current role: KNOWLEDGE ASSISTANT — EMPTY CATALOG
The user has not uploaded any photos yet.
- You CANNOT search, display, score, or reference ANY photos.
- Always return an empty photo_groups array.

Your job:
1. Answer any questions about Photoreka's features using the app knowledge provided below.
2. Guide the user to upload photos first via the Import Area.
3. Once they have analyzed photos, the full photo assistant is available at {url:/chat-lab}
4. NEVER invent photo content, filenames, or pretend the catalog has data.`
  }

  return `

## Your current role: KNOWLEDGE ASSISTANT — NO ANALYZED PHOTOS
The user has ${photoCount} photo(s) uploaded but none have been analyzed yet.
- You CANNOT search, display, score, or reference ANY photos from their catalog.
- Always return an empty photo_groups array.

Your job:
1. Answer any questions about Photoreka's features using the app knowledge provided below.
2. Guide the user to analyze their photos via the Analyze button in the Import Area.
3. Once analyzed, the full photo assistant is available at {url:/chat-lab}
4. NEVER invent photo content, filenames, or pretend the catalog has data.`
}

const KNOWLEDGE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Response to show the user. Plain Markdown, no headers.' },
  },
  required: ['text'],
} as const

// ── Service ────────────────────────────────────────────────────────────────────

export default class LangchainAgentKnowledgeService {
  private conversationService = new ConversationService()

  public async chat(
    userId: number,
    conversationId: number,
    message: string,
    selectedMode: ChatIntelligenceMode,
    uiContext?: string
  ): Promise<AgentChatResult> {
    const modelName = selectedMode.modelPhase2Lite
    console.log(
      `\n[KnowledgeAgent] ▶ No-photos path | userId=${userId} | mode=${selectedMode.id} | message="${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`
    )

    const [{ context: userContext, photoCount, analyzedCount }, history] = await Promise.all([
      this.buildUserContext(userId),
      conversationId > 0
        ? this.conversationService.getLLMContext(conversationId)
        : Promise.resolve<ChatMessage[]>([]),
    ])

    const roleAddendum =
      buildRoleAddendum(photoCount, analyzedCount) +
      (uiContext
        ? `\n\n## Current Screen Context\n${uiContext}\nUse this context to give accurate, screen-specific answers (e.g. "what does this screen do?").`
        : '')
    const messages = this.buildMessages(userContext, roleAddendum, history, message)

    const model = this.createModel(modelName).withStructuredOutput(KNOWLEDGE_SCHEMA)
    const usageCollector: { usage?: any } = {}

    let text = ''
    let lastError: any
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        console.log(`[KnowledgeAgent] 🏁 Attempt ${attempt + 1}/${MAX_ATTEMPTS}…`)
        const result = (await model.invoke(messages, {
          callbacks: [makeDebugCallback('knowledge'), makeUsageCallback(usageCollector)],
        })) as { text: string }
        text = result.text
        break
      } catch (err: any) {
        lastError = err
        console.warn(
          `[KnowledgeAgent] ⚠️  Attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${err?.message ?? err}`
        )
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        }
      }
    }
    if (!text) throw lastError

    const cost = this.computeCost(usageCollector.usage, modelName)
    console.log(
      `[KnowledgeAgent] ✅ Done. Cost: €${cost.total.costEur.toFixed(6)} | in=${cost.total.inputTokens} out=${cost.total.outputTokens}`
    )

    return {
      output: text,
      photoGroups: [],
      toolsUsed: [],
      intermediateSteps: [],
      totalIterations: 1,
      cost,
    }
  }

  // ── Message building ─────────────────────────────────────────────────────────

  private buildMessages(
    userContext: string,
    roleAddendum: string,
    history: ChatMessage[],
    message: string
  ): any[] {
    const knowledgeText = Object.entries(APP_KNOWLEDGE_SECTIONS)
      .map(([key, value]) => `### ${key}\n${value}`)
      .join('\n\n---\n\n')

    const systemContent = [
      SYSTEM_PROMPT_BASE + roleAddendum,
      userContext,
      `## App Knowledge\n${knowledgeText}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const msgs: any[] = [new SystemMessage(systemContent)]

    for (const m of history) {
      if (typeof m.content !== 'string' || m.content.trim().length === 0) continue
      msgs.push(m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content))
    }

    msgs.push(new HumanMessage(message))

    // Merge consecutive same-role messages for Gemini alternation requirement
    const merged: any[] = [msgs[0]]
    for (let i = 1; i < msgs.length; i++) {
      const prev = merged[merged.length - 1]
      const curr = msgs[i]
      if (prev instanceof HumanMessage && curr instanceof HumanMessage) {
        merged[merged.length - 1] = new HumanMessage(
          extractText(prev.content) + '\n' + extractText(curr.content)
        )
      } else if (prev instanceof AIMessage && curr instanceof AIMessage) {
        merged[merged.length - 1] = new AIMessage(
          extractText(prev.content) + '\n' + extractText(curr.content)
        )
      } else {
        merged.push(curr)
      }
    }

    return merged
  }

  // ── User context ─────────────────────────────────────────────────────────────

  private async buildUserContext(
    userId: number
  ): Promise<{ context: string; photoCount: number; analyzedCount: number }> {
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
    if (!user) return { context: '', photoCount, analyzedCount }

    const lines: string[] = ['## Current user context']
    lines.push(`- Current date: ${new Date().toISOString().slice(0, 10)}`)
    lines.push(`- Name: ${user.name}`)
    if (user.preferredSource) lines.push(`- Preferred upload source: ${user.preferredSource}`)
    if (user.profiles) lines.push(`- Photography profile: ${user.profiles}`)
    lines.push(
      `- Catalog size: ${photoCount} photo${photoCount !== 1 ? 's' : ''} (${analyzedCount} analyzed)`
    )

    if (photoCount === 0) {
      lines.push(
        `- ⚠️ CRITICAL: This catalog is EMPTY (0 photos). The user has not uploaded any photos yet. There is NOTHING to search, display, analyze, or reference. Do NOT fabricate any photo filenames, descriptions, or content. Inform the user that they need to upload photos first. Return empty photo_groups.`
      )
    } else if (analyzedCount === 0) {
      lines.push(
        `- ⚠️ CRITICAL: The user has ${photoCount} photo(s) uploaded but NONE have been analyzed yet. The photos exist in the Import Area but are NOT searchable, scoreable, or describable — no descriptions, no scores, no visual data is available. Do NOT fabricate any photo filenames, descriptions, or content. Inform the user that their photos need to be analyzed first (via the Analyze button in the Import Area). Return empty photo_groups.`
      )
    } else {
      lines.push(
        `- NOTE: You are a knowledge-only assistant. You do NOT have access to the user's catalog data. For any photo-related actions, redirect the user to the full photo assistant at {url:/chat-lab}. Return empty photo_groups.`
      )
    }

    return { context: lines.join('\n'), photoCount, analyzedCount }
  }

  // ── Model & cost ─────────────────────────────────────────────────────────────

  private createModel(modelName: string) {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: modelName,
      maxOutputTokens: MAX_TOKENS,
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

  private computeCost(usageMeta: any, modelName: string): AgentCostBreakdown {
    const inputTokens = usageMeta?.input_tokens ?? 0
    const outputTokens = usageMeta?.output_tokens ?? 0
    const cachedTokens = usageMeta?.input_token_details?.cache_read ?? 0
    const totalTokens = usageMeta?.total_tokens ?? inputTokens + outputTokens

    const prices = (
      PRICES as Record<
        string,
        { input_cache_miss: number; input_cache_hit: number; output: number }
      >
    )[modelName]
    let costEur = 0
    if (prices) {
      const cacheMiss = inputTokens - cachedTokens
      costEur =
        (cacheMiss * prices.input_cache_miss +
          cachedTokens * prices.input_cache_hit +
          outputTokens * prices.output) *
        USD_TO_EUR
    }

    const entry: TokenUsageEntry = {
      label: 'knowledge',
      inputTokens,
      cachedTokens,
      outputTokens,
      totalTokens,
      costEur,
    }
    return { iterations: [], phase2: entry, total: entry }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('')
  }
  return ''
}
