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

// ── Model ──────────────────────────────────────────────────────────────────────
// Lightweight model — no tool orchestration needed, just an informative response.
const MODEL = 'gemini-3.1-flash-lite-preview'
const MAX_TOKENS = 1200
const MAX_ATTEMPTS = 2

// ── Prompts ────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are Photoreka's intelligent photo assistant.
Help photographers explore and analyze their library with insight and wit.

## Behavior
- **Language:** Always match the user's language.
- **Scope:** Strictly photography and Photoreka features. Polite refusal for outside topics.
- **Grounding:** NEVER fabricate photo filenames, descriptions, scores, or content.`

const KNOWLEDGE_ROLE_ADDENDUM = `

## Your current role: ASSISTANT — NO ANALYZED PHOTOS
The user currently has no analyzed photos available. This means:
- You CANNOT search, display, score, or reference ANY photos from their catalog.
- Tools like search, catalog view, and photo info have no data to operate on.
- Always return an empty photo_groups array.

Your job:
1. Clearly and kindly explain the situation (no analyzed photos yet).
2. Guide the user to the Sync Area to upload and/or analyze their photos.
3. Answer any questions about Photoreka's features using the app knowledge provided below.
4. NEVER invent photo content, filenames, or pretend the catalog has data.`

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
    message: string
  ): Promise<AgentChatResult> {
    console.log(
      `\n[KnowledgeAgent] ▶ No-photos path | userId=${userId} | message="${message.slice(0, 80)}${message.length > 80 ? '…' : ''}"`
    )

    const [userContext, history] = await Promise.all([
      this.buildUserContext(userId),
      conversationId > 0
        ? this.conversationService.getLLMContext(conversationId)
        : Promise.resolve<ChatMessage[]>([]),
    ])

    const messages = this.buildMessages(userContext, history, message)

    const model = this.createModel().withStructuredOutput(KNOWLEDGE_SCHEMA)
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

    const cost = this.computeCost(usageCollector.usage)
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

  private buildMessages(userContext: string, history: ChatMessage[], message: string): any[] {
    const knowledgeText = Object.entries(APP_KNOWLEDGE_SECTIONS)
      .map(([key, value]) => `### ${key}\n${value}`)
      .join('\n\n---\n\n')

    const systemContent = [
      SYSTEM_PROMPT_BASE + KNOWLEDGE_ROLE_ADDENDUM,
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

    if (photoCount === 0) {
      lines.push(
        `- ⚠️ CRITICAL: This catalog is EMPTY (0 photos). The user has not uploaded any photos yet. There is NOTHING to search, display, analyze, or reference. Do NOT fabricate any photo filenames, descriptions, or content. Inform the user that they need to upload photos first. Return empty photo_groups.`
      )
    } else {
      lines.push(
        `- ⚠️ CRITICAL: The user has ${photoCount} photo(s) uploaded but NONE have been analyzed yet. The photos exist in the Sync Area but are NOT searchable, scoreable, or describable — no descriptions, no scores, no visual data is available. Do NOT fabricate any photo filenames, descriptions, or content. Inform the user that their photos need to be analyzed first (via the Analyze button in the Sync Area). Return empty photo_groups.`
      )
    }

    return lines.join('\n')
  }

  // ── Model & cost ─────────────────────────────────────────────────────────────

  private createModel() {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: MODEL,
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

  private computeCost(usageMeta: any): AgentCostBreakdown {
    const inputTokens = usageMeta?.input_tokens ?? 0
    const outputTokens = usageMeta?.output_tokens ?? 0
    const cachedTokens = usageMeta?.input_token_details?.cache_read ?? 0
    const totalTokens = usageMeta?.total_tokens ?? inputTokens + outputTokens

    const prices = (
      PRICES as Record<
        string,
        { input_cache_miss: number; input_cache_hit: number; output: number }
      >
    )[MODEL]
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
