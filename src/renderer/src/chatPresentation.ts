import type { ChatAnswer, ChatMessage } from '../../shared/contracts'

export type ChatRequestPhase = 'idle' | 'answering' | 'cancelling'

export interface ChatRequestState {
  phase: ChatRequestPhase
  requestId?: string
}

export const idleChatRequest: ChatRequestState = { phase: 'idle' }

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
