import { BaseCallbackHandler } from '@langchain/core/callbacks/base'

// ─── Debug / callback utilities for LangchainAgentService ───────────────────

export const _debug: {
  calls: Array<{ label: string; messages: Array<Record<string, any>> }>
} = { calls: [] }

export function compactPreview(json: string, maxLen = 220): string {
  const oneliner = json.replace(/\s+/g, ' ').trim()
  return oneliner.length > maxLen ? `${oneliner.slice(0, maxLen)}…` : oneliner
}

export function serializeMessageForDebug(msg: any): Record<string, any> {
  const base: Record<string, any> = { role: msg.type ?? 'unknown' }

  if (typeof msg.content === 'string') {
    base.content = msg.content
  } else if (Array.isArray(msg.content)) {
    base.content = msg.content.map((p: any) =>
      p?.type === 'image_url' || p?.type === 'image'
        ? { type: p.type, source: '[image data omitted]' }
        : p
    )
  }

  if (msg.tool_calls?.length) {
    base.tool_calls = msg.tool_calls.map((tc: any) => ({ name: tc.name, args: tc.args, id: tc.id }))
  }

  if (msg.tool_call_id !== undefined) {
    base.tool_call_id = msg.tool_call_id
  }

  return base
}

export function makeDebugCallback(label: string): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleChatModelStart(_llm: any, messages: any[][]) {
      _debug.calls.push({ label, messages: messages[0].map(serializeMessageForDebug) })
    },
  })
}

export function makeUsageCallback(collector: { usage?: any }): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleLLMEnd(output: any) {
      const msg = output?.generations?.[0]?.[0]?.message
      if (msg?.usage_metadata) collector.usage = msg.usage_metadata
    },
  })
}
