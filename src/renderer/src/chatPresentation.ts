import type { ChatAnswer, ChatMessage } from '../../shared/contracts'

export type ChatRequestPhase = 'idle' | 'answering' | 'cancelling'

export interface ChatRequestState {
  phase: ChatRequestPhase
  requestId?: string
}

export const idleChatRequest: ChatRequestState = { phase: 'idle' }

export type GenerationEndpointPrivacy =
  'loopback' | 'remote-encrypted' | 'remote-unencrypted' | 'invalid'

export function generationEndpointPrivacy(endpoint: string): GenerationEndpointPrivacy {
  try {
    const url = new URL(endpoint)
    const hostname = url.hostname.toLocaleLowerCase()
    if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return 'loopback'
    return url.protocol === 'https:' ? 'remote-encrypted' : 'remote-unencrypted'
  } catch {
    return 'invalid'
  }
}

export function beginChatRequest(requestId: string): ChatRequestState {
  return { phase: 'answering', requestId }
}

export function cancelChatRequest(state: ChatRequestState): ChatRequestState {
  return state.requestId ? { ...state, phase: 'cancelling' } : state
}

export function completeChatRequest(): ChatRequestState {
  return idleChatRequest
}

export function createChatMessage(
  role: ChatMessage['role'],
  content: string,
  citations: ChatMessage['citations'] = [],
  grounding: ChatMessage['grounding'] = null,
  id: string = crypto.randomUUID(),
  createdAt: string = new Date().toISOString()
): ChatMessage {
  return { id, role, content, citations, grounding, createdAt }
}

export function messageForAnswer(answer: ChatAnswer, id?: string, createdAt?: string): ChatMessage {
  return answer.kind === 'answer'
    ? createChatMessage('assistant', answer.text, answer.citations, answer.grounding, id, createdAt)
    : createChatMessage('assistant', answer.reason, [], null, id, createdAt)
}
