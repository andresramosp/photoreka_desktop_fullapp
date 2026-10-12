import { AsyncLocalStorage } from 'node:async_hooks'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
  AIMessage,
  type BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { RunnableLambda } from '@langchain/core/runnables'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { isInteropZodSchema } from '@langchain/core/utils/types'
import { invokeCloudChatModel, type ChatTicket } from './cloud_functions.js'

/**
 * Escritorio: el chat corre aquí (agente, prompts, herramientas), pero sus llamadas a modelos se
 * hacen y se cobran en la nube. El turno de chat lleva su pase en un contexto asíncrono, así que
 * cualquier llamada a modelo que ocurra dentro del turno, por profunda que esté, lo encuentra sin
 * tener que pasarlo de mano en mano. Fuera de un turno de chat no hay modelos.
 */

const turn = new AsyncLocalStorage<ChatTicket>()

/** Marca el resto de la petición actual como parte del turno de chat del pase. */
export function enterChatTurn(ticket: ChatTicket) {
  turn.enterWith(ticket)
}

export function currentChatTicket(): ChatTicket | null {
  return turn.getStore() ?? null
}

function requireTicket(): ChatTicket {
  const ticket = currentChatTicket()
  if (!ticket) throw new Error('[escritorio] llamada a un modelo fuera de un turno de chat')
  return ticket
}

/** Argumentos con los que el chat crea su modelo (los de createChatModel de App). */
export type CloudChatModelConfig = {
  kind: 'agent' | 'knowledge'
  model: string
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
  disableThinking?: boolean
  thinkingLevel?: 'low' | 'medium' | 'high'
  mediaResolution?: 'low' | 'medium' | 'high'
}

type Binding = { tools?: unknown[]; toolChoice?: unknown; structured?: { schema: unknown; method?: string } }

/**
 * Modelo de chat de LangChain que delega cada llamada en la nube. Admite lo que usa el chat:
 * bindTools, withStructuredOutput e invoke. Las herramientas y los esquemas viajan como JSON y la
 * nube los aplica al modelo real del proveedor, lo que produce la misma petición que el original;
 * los callbacks (uso de tokens, depuración) funcionan como con cualquier modelo de LangChain.
 */
export class CloudChatModel extends BaseChatModel {
  constructor(
    private config: CloudChatModelConfig,
    private binding: Binding = {}
  ) {
    super({})
  }

  _llmType() {
    return 'photoreka-cloud'
  }

  bindTools(tools: any[], kwargs?: { tool_choice?: unknown }): any {
    return new CloudChatModel(this.config, {
      ...this.binding,
      tools: tools.map((tool) => convertToOpenAITool(tool)),
      toolChoice: kwargs?.tool_choice,
    })
  }

  withStructuredOutput(schema: any, config?: { method?: string }): any {
    const zod = isInteropZodSchema(schema)
    const model = new CloudChatModel(this.config, {
      ...this.binding,
      structured: { schema: zod ? toJsonSchema(schema) : schema, method: config?.method },
    })
    return model.pipe(
      RunnableLambda.from((message: AIMessage) => {
        const { parsed, parsingError } = (message.additional_kwargs as any).photoreka ?? {}
        if (parsingError || parsed === undefined || parsed === null) {
          throw new Error(`Failed to parse structured output: ${parsingError ?? 'empty'}`)
        }
        return zod ? (schema as any).parse(parsed) : parsed
      })
    )
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const ticket = requireTicket()
    const response = await invokeCloudChatModel(ticket, {
      config: this.config,
      messages: mapChatMessagesToStoredMessages(messages),
      tools: this.binding.tools,
      toolChoice: this.binding.toolChoice,
      structured: this.binding.structured,
      task: this.binding.structured ? 'chat_structured' : this.binding.tools ? 'chat_tools' : 'chat_model',
    })
    const [message] = mapStoredMessagesToChatMessages([response.message]) as AIMessage[]
    if (this.binding.structured) {
      ;(message.additional_kwargs as any).photoreka = {
        parsed: response.parsed,
        parsingError: response.parsingError,
      }
    }
    const text = typeof message.content === 'string' ? message.content : ''
    return { generations: [{ text, message }] }
  }
}
