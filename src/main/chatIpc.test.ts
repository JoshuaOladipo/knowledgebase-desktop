import type { IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalGenerationSettings } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'
import { registerChatIpcHandlers, validateAskQuestionRequest } from './chatIpc'
import { createEmbeddingProvider } from './config/aiSettings'
import { DatabaseService } from './database/database'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

const settings: LocalGenerationSettings = {
  enabled: true,
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'test-model',
  requestTimeoutMs: 5_000,
  maximumOutputTokens: 256,
  temperature: 0
}

function event(url = 'file:///app/index.html'): IpcMainInvokeEvent {
  const mainFrame = { url }
  return { senderFrame: mainFrame, sender: { mainFrame } } as unknown as IpcMainInvokeEvent
}

describe('chat IPC', () => {
  let databaseService: DatabaseService | undefined

  afterEach(async () => databaseService?.close())

  it('validates exact bounded ask payloads', () => {
    expect(validateAskQuestionRequest({ requestId: 'one', question: ' question ' })).toEqual({
      requestId: 'one',
      question: 'question'
    })
    expect(() =>
      validateAskQuestionRequest({ requestId: 'one', question: 'question', path: '/tmp' })
    ).toThrow('unknown field')
    expect(() => validateAskQuestionRequest({ requestId: '', question: 'question' })).toThrow(
      'Request ID'
    )
  })

  it('answers through task-level IPC and persists mapped citation snapshots', async () => {
    databaseService = new DatabaseService(':memory:')
    const database = await databaseService.open()
    const handlers = new Map<string, Handler>()
    const saveGenerationSettings = vi.fn(async (value: LocalGenerationSettings) => value)
    registerChatIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler as Handler) },
      {
        database,
        embeddings: createEmbeddingProvider(),
        trustedRendererUrl: 'file:///app/index.html',
        watchedRoots: () => ['/managed'],
        loadGenerationSettings: async () => settings,
        saveGenerationSettings,
        createAnswerService: () => ({
          answer: async () => ({
            kind: 'answer',
            text: 'Grounded answer',
            citations: [
              {
                sourceId: 'source-1',
                chunkId: 'chunk-1',
                documentId: 'document-1',
                documentPath: '/managed/note.txt',
                documentName: 'note.txt',
                heading: null,
                sourceKind: null,
                sourceIndex: null,
                sourceLabel: null,
                excerpt: 'Evidence snapshot'
              }
            ]
          })
        })
      }
    )

    await expect(
      handlers.get(ipcChannels.askQuestion)!(event(), {
        requestId: 'request-1',
        question: 'What is in the note?'
      })
    ).resolves.toMatchObject({
      conversationId: expect.any(String),
      answer: {
        kind: 'answer',
        text: 'Grounded answer',
        citations: [{ sourceId: 'source-1', documentName: 'note.txt' }]
      }
    })
    const conversations = (await handlers.get(ipcChannels.listConversations)!(event())) as Array<{
      id: string
    }>
    const saved = await handlers.get(ipcChannels.readConversation)!(event(), conversations[0].id)
    expect(saved).toMatchObject({
      messages: [
        { role: 'user', content: 'What is in the note?' },
        {
          role: 'assistant',
          content: 'Grounded answer',
          citations: [{ excerpt: 'Evidence snapshot' }]
        }
      ]
    })
    await handlers.get(ipcChannels.deleteConversation)!(event(), conversations[0].id)
    await expect(handlers.get(ipcChannels.listConversations)!(event())).resolves.toEqual([])

    await handlers.get(ipcChannels.updateLocalGenerationSettings)!(event(), settings)
    expect(saveGenerationSettings).toHaveBeenCalledWith(settings)
    await expect(
      handlers.get(ipcChannels.listConversations)!(event('https://attacker.test'))
    ).rejects.toThrow('untrusted sender')
  })

  it('cancels an active request by opaque request ID', async () => {
    databaseService = new DatabaseService(':memory:')
    const database = await databaseService.open()
    const handlers = new Map<string, Handler>()
    registerChatIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler as Handler) },
      {
        database,
        embeddings: createEmbeddingProvider(),
        trustedRendererUrl: 'file:///app/index.html',
        watchedRoots: () => ['/managed'],
        loadGenerationSettings: async () => settings,
        saveGenerationSettings: async (value) => value,
        createAnswerService: () => ({
          answer: ({ signal }) =>
            new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => reject(new Error('cancelled')))
            })
        })
      }
    )

    const pending = handlers.get(ipcChannels.askQuestion)!(event(), {
      requestId: 'request-to-cancel',
      question: 'Question'
    }) as Promise<unknown>
    await Promise.resolve()
    await handlers.get(ipcChannels.cancelQuestion)!(event(), 'request-to-cancel')
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('reports disabled local generation and missing watched roots before provider work', async () => {
    databaseService = new DatabaseService(':memory:')
    const database = await databaseService.open()
    const handlers = new Map<string, Handler>()
    let loadedSettings = { ...settings, enabled: false }
    registerChatIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler as Handler) },
      {
        database,
        embeddings: createEmbeddingProvider(),
        trustedRendererUrl: 'file:///app/index.html',
        watchedRoots: () => [],
        loadGenerationSettings: async () => loadedSettings,
        saveGenerationSettings: async (value) => value,
        createAnswerService: () => ({
          answer: vi.fn(async () => ({
            kind: 'insufficient-context' as const,
            reason: 'no-candidates'
          }))
        })
      }
    )
    const request = { requestId: 'offline-request', question: 'Question' }

    await expect(handlers.get(ipcChannels.askQuestion)!(event(), request)).rejects.toThrow(
      'Enable the local generation server'
    )
    loadedSettings = { ...settings, enabled: true }
    await expect(handlers.get(ipcChannels.askQuestion)!(event(), request)).rejects.toThrow(
      'Add a watched folder'
    )
  })
})
