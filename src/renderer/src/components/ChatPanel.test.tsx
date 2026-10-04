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
  it('discloses remote evidence transfer and unencrypted HTTP transport', async () => {
    window.pcAgent = {
      getGenerationServerSettings: vi.fn().mockResolvedValue({
        enabled: false,
        endpoint: 'http://192.168.1.20:8080/v1',
        model: 'remote-model',
        requestTimeoutMs: 30_000,
        maximumOutputTokens: 512,
        temperature: 0.2
      }),
      listConversations: vi.fn().mockResolvedValue([])
    } as unknown as PcAgentApi
    render(<ChatPanel />)

    const warning = await screen.findByRole('note')
    expect(warning.textContent).toContain('selected document excerpts')
    expect(warning.textContent).toContain('not encrypted in transit')
  })

  it('clearly labels a model-knowledge answer as ungrounded', async () => {
    window.pcAgent = {
      getGenerationServerSettings: vi.fn().mockResolvedValue({
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
