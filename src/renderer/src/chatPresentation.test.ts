import { describe, expect, it } from 'vitest'
import {
  beginChatRequest,
  cancelChatRequest,
  completeChatRequest,
  idleChatRequest,
  messageForAnswer
} from './chatPresentation'

describe('chat presentation state', () => {
  it('tracks answering, cancelling, and completion deterministically', () => {
    const answering = beginChatRequest('request-1')
    expect(answering).toEqual({ phase: 'answering', requestId: 'request-1' })
    expect(cancelChatRequest(answering)).toEqual({
      phase: 'cancelling',
      requestId: 'request-1'
    })
    expect(completeChatRequest()).toEqual(idleChatRequest)
    expect(cancelChatRequest(idleChatRequest)).toEqual(idleChatRequest)
  })

  it('renders insufficient context and keeps structured citations separate from answer text', () => {
    expect(
      messageForAnswer(
        { kind: 'insufficient-context', reason: 'Not enough relevant information.' },
        'one',
        '2026-10-04T00:00:00.000Z'
      )
    ).toMatchObject({
      role: 'assistant',
      content: 'Not enough relevant information.',
      citations: [],
      grounding: null
    })

    const citation = {
      sourceId: 'source-1',
      documentPath: '/managed/note.txt',
      documentName: 'note.txt',
      heading: null,
      sourceLabel: null,
      excerpt: 'Evidence'
    }
    expect(
      messageForAnswer(
        {
          kind: 'answer',
          text: 'Grounded answer',
          citations: [citation],
          grounding: 'documents'
        },
        'two',
        '2026-10-04T00:00:00.000Z'
      )
    ).toMatchObject({
      content: 'Grounded answer',
      citations: [citation],
      grounding: 'documents'
    })

    expect(
      messageForAnswer(
        { kind: 'answer', text: 'Model answer', citations: [], grounding: 'model' },
        'three',
        '2026-10-04T00:00:00.000Z'
      )
    ).toMatchObject({ content: 'Model answer', citations: [], grounding: 'model' })
  })
})
