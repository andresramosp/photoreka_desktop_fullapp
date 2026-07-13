import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * chat_debug_dump.ts
 * -----------------------------------------------------------------
 * Writes the EXACT message array handed to the Phase 2 model to a readable
 * text file, so what the curator actually sees can be inspected instead of
 * inferred.
 *
 * DISABLED BY DEFAULT. Set CHAT_DEBUG_DUMP=true to turn it on.
 * Output goes to CHAT_DEBUG_DIR (default `tmp/chat-debug/`, already gitignored).
 *
 * Rendering rules — the point is legibility, not fidelity to the wire format:
 *  - Base64 image payloads are replaced by a one-line placeholder. Dumping them
 *    would produce megabytes of noise and bury the thing you opened the file for.
 *    The photo's text part sits directly above each image, so you still know
 *    exactly which frame the model was looking at.
 *  - Embedded JSON (tool results, photo payloads) is pretty-printed. It is sent
 *    to the model compact, on purpose, to save tokens — that compactness is what
 *    makes it unreadable here, and it is exactly what this file exists to undo.
 *  - Everything else is verbatim.
 *
 * Never throws: a debug facility must not be able to break a chat turn.
 * -----------------------------------------------------------------
 */

export function isChatDebugDumpEnabled(): boolean {
  return process.env.CHAT_DEBUG_DUMP === 'true'
}

export type Phase2DumpMeta = {
  userId: number
  modeId: string
  model: string
  thinkingLevel?: string
  /** The user's message this turn — the question the dump is the answer to. */
  message: string
  lensInjected: boolean
}

const RULE = '='.repeat(100)
const THIN = '-'.repeat(100)

/** Rough token estimate. Good enough to see which block is eating the context. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Pretty-prints a JSON payload that arrives as a compact string. Photo parts come
 * as `[filename — id:N]\n{...json...}`, so the leading label is preserved and only
 * the JSON tail is expanded. Returns the input unchanged when it is not JSON.
 */
function expandJson(text: string): string {
  const newlineAt = text.indexOf('\n')
  const label = newlineAt === -1 ? '' : text.slice(0, newlineAt + 1)
  const body = newlineAt === -1 ? text : text.slice(newlineAt + 1)
  try {
    return label + JSON.stringify(JSON.parse(body.trim()), null, 2)
  } catch {
    return text
  }
}

/** Renders one message's content, whatever shape LangChain gave it. */
function renderContent(content: any): string {
  if (typeof content === 'string') return expandJson(content)
  if (!Array.isArray(content)) return String(content ?? '')

  const chunks: string[] = []
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      chunks.push(expandJson(part.text))
      continue
    }
    if (part?.type === 'image_url') {
      const url: string = part.image_url?.url ?? ''
      chunks.push(
        url.startsWith('data:')
          ? `<<IMAGE — inline base64, ${url.length.toLocaleString()} chars (omitted for legibility)>>`
          : `<<IMAGE — ${url}>>`
      )
      continue
    }
    chunks.push(`<<UNRENDERED PART: ${JSON.stringify(part)}>>`)
  }
  return chunks.join('\n')
}

/** LangChain message class → the role name worth reading in a dump. */
function roleOf(msg: any): string {
  const type = msg?._getType?.() ?? msg?.constructor?.name ?? 'unknown'
  const map: Record<string, string> = {
    system: 'SYSTEM',
    human: 'HUMAN',
    ai: 'AI',
    tool: 'TOOL',
  }
  return map[type] ?? String(type).toUpperCase()
}

/**
 * Dumps the Phase 2 input. Fire-and-forget: awaited by the caller only so the file
 * is on disk before the model call returns, never so a failure can surface.
 */
export async function dumpPhase2Input(messages: any[], meta: Phase2DumpMeta): Promise<void> {
  if (!isChatDebugDumpEnabled()) return

  try {
    const dir = resolve(process.env.CHAT_DEBUG_DIR ?? 'tmp/chat-debug')
    await mkdir(dir, { recursive: true })

    const now = new Date()
    const stamp = now.toISOString().replace(/[:.]/g, '-')
    const file = join(dir, `phase2-${stamp}-u${meta.userId}.txt`)

    const lines: string[] = []
    lines.push(RULE)
    lines.push('PHASE 2 INPUT — exactly what the curator model receives')
    lines.push(RULE)
    lines.push(`Timestamp      : ${now.toISOString()}`)
    lines.push(`User           : ${meta.userId}`)
    lines.push(`Intelligence   : ${meta.modeId}`)
    lines.push(`Model          : ${meta.model}`)
    lines.push(`Thinking level : ${meta.thinkingLevel ?? '(model default)'}`)
    lines.push(`Curatorial lens: ${meta.lensInjected ? 'INJECTED' : 'not injected'}`)
    lines.push(`Messages       : ${messages.length}`)
    lines.push(`User message   : ${meta.message}`)
    lines.push('')

    let totalTokens = 0
    let imageCount = 0

    const bodies: string[] = []
    messages.forEach((msg, index) => {
      const role = roleOf(msg)
      const body = renderContent(msg?.content)
      imageCount += (body.match(/<<IMAGE/g) ?? []).length

      // Tool calls live beside the content, not inside it — an AI message that only
      // emits tool calls has empty content and would otherwise render as a blank block.
      const toolCalls: any[] = msg?.tool_calls ?? []
      const toolCallBlock = toolCalls.length
        ? '\n' +
          toolCalls
            .map((tc) => `  → tool_call: ${tc.name}(${JSON.stringify(tc.args ?? {})})`)
            .join('\n')
        : ''

      const name = msg?.name ? ` name=${msg.name}` : ''
      const tokens = estimateTokens(body + toolCallBlock)
      totalTokens += tokens

      bodies.push(THIN)
      bodies.push(`[${String(index).padStart(2, '0')}] ${role}${name}  (~${tokens} tokens)`)
      bodies.push(THIN)
      bodies.push(body + toolCallBlock)
      bodies.push('')
    })

    lines.push(`Estimated total: ~${totalTokens.toLocaleString()} tokens (images excluded)`)
    lines.push(`Images attached: ${imageCount}`)
    lines.push('')
    lines.push(...bodies)

    await writeFile(file, lines.join('\n'), 'utf8')
    console.log(`[Agent] 📝 Phase 2 input dumped → ${file}`)
  } catch (err: any) {
    // A debug facility must never take a chat turn down with it.
    console.warn(`[Agent] ⚠️  Phase 2 debug dump failed: ${err?.message ?? err}`)
  }
}
