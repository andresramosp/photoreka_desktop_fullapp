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

/**
 * `usage_metadata` de un mensaje, con los tokens de razonamiento de Anthropic añadidos.
 *
 * @langchain/anthropic normaliza el desglose de input (cache_read / cache_creation) pero
 * deja fuera `output_tokens_details.thinking_tokens`, que solo llega crudo en
 * `response_metadata.usage`. Aquí se copia al hueco estándar `output_token_details.reasoning`
 * —el mismo que ya usa OpenAI— para que el cálculo de coste no tenga que saber de qué
 * proveedor viene. La semántica coincide en ambos: el razonamiento YA está contado dentro
 * de `output_tokens`, así que se lee para medirlo, nunca para sumarlo.
 *
 * Para el resto de proveedores devuelve el `usage_metadata` tal cual.
 */
export function extractUsageMetadata(msg: any): any {
  const usage = msg?.usage_metadata
  if (!usage) return usage

  const anthropicThinking = msg?.response_metadata?.usage?.output_tokens_details?.thinking_tokens
  if (!anthropicThinking || usage.output_token_details?.reasoning) return usage

  return {
    ...usage,
    output_token_details: { ...usage.output_token_details, reasoning: anthropicThinking },
  }
}

export function makeUsageCallback(collector: { usage?: any }): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleLLMEnd(output: any) {
      const msg = output?.generations?.[0]?.[0]?.message
      if (msg?.usage_metadata) collector.usage = extractUsageMetadata(msg)
    },
  })
}
