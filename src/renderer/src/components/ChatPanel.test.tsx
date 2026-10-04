// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PcAgentApi } from '../../../shared/contracts'
import ChatPanel from './ChatPanel'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChatPanel', () => {
  it('clearly labels a model-knowledge answer as ungrounded', async () => {
    window.pcAgent = {
      getLocalGenerationSettings: vi.fn().mockResolvedValue({
        enabled: true,
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'local-model',
        requestTimeoutMs: 30_000,
        maximumOutputTokens: 512,
        temperature: 0.2
      }),
      listConversations: vi.fn().mockResolvedValue([]),
      askQuestion: vi.fn().mockResolvedValue({
        conversationId: 'conversation-1',
        answer: {
          kind: 'answer',
          text: 'This comes from general model knowledge.',
          citations: [],
          grounding: 'model'
        }
      })
    } as unknown as PcAgentApi
    const user = userEvent.setup()
    render(<ChatPanel />)

    const question = await screen.findByPlaceholderText('What do my files say about…')
    await user.type(question, 'What is the capital of France?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect((await screen.findByRole('note')).textContent).toContain(
      'Ungrounded answer — no relevant indexed evidence was found.'
    )
    expect(screen.getByText('This comes from general model knowledge.')).toBeTruthy()
  })
})
