import type { IpcMainInvokeEvent } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/contracts'
import { ChunkRepository } from './database/chunkRepository'
import { DatabaseService } from './database/database'
import { LocalDiagnostics } from './diagnostics'
import { registerIndexIpcHandlers } from './indexIpc'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

function event(url = 'file:///app/index.html'): IpcMainInvokeEvent {
  const mainFrame = { url }
  return { senderFrame: mainFrame, sender: { mainFrame } } as unknown as IpcMainInvokeEvent
}

describe('index IPC', () => {
  let databaseService: DatabaseService | undefined
  let directory: string | undefined

  afterEach(async () => {
    await databaseService?.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('exposes aggregate status and validates re-index, retry, reveal, clear, and export', async () => {
    directory = await mkdtemp(join(tmpdir(), 'pc-agent-index-ipc-'))
    const path = join(directory, 'note.txt')
    await writeFile(path, 'evidence', 'utf8')
    databaseService = new DatabaseService(':memory:')
    const database = await databaseService.open()
    const chunks = new ChunkRepository(database)
    const document = await chunks.replaceDocument(
      {
        path,
        name: 'note.txt',
        watchedRoot: directory,
        mimeType: 'text/plain',
        size: 8,
        modifiedAt: new Date().toISOString(),
        contentHash: 'hash',
        configFingerprint: 'config',
        status: 'indexed'
      },
      [
        {
          ordinal: 0,
          content: 'evidence',
          tokenCount: 1,
          startOffset: 0,
          endOffset: 8,
          embedding: [1, 0],
          embeddingProvider: 'test',
          embeddingModel: 'test',
          embeddingDimensions: 2
        }
      ]
    )
    const handlers = new Map<string, Handler>()
    const ingestion = {
      getQueueState: vi.fn(() => ({ pendingJobs: 2, activeWorkers: 1 })),
      reindexAll: vi.fn(),
      retry: vi.fn()
    }
    const watcher = {
      getFiles: vi.fn(() => [{ path, name: 'note.txt', isDirectory: false }]),
      getState: vi.fn(() => ({ folders: [directory], phase: 'watching' }))
    }
    const diagnostics = new LocalDiagnostics()
    diagnostics.record('file-embedding', 10, 'success')
    const revealFile = vi.fn()
    const exportDiagnostics = vi.fn(async () => true)
    registerIndexIpcHandlers(
      { handle: (channel, handler) => void handlers.set(channel, handler as Handler) },
      {
        database,
        ingestion: ingestion as never,
        watcher: watcher as never,
        diagnostics,
        trustedRendererUrl: 'file:///app/index.html',
        revealFile,
        exportDiagnostics
      }
    )

    await expect(handlers.get(ipcChannels.getIndexStatus)!(event())).resolves.toMatchObject({
      counts: { indexed: 1 },
      pendingJobs: 2,
      activeWorkers: 1,
      chunkCount: 1,
      documents: [{ id: document.id, path, status: 'indexed', chunkCount: 1 }],
      diagnostics: { telemetryEnabled: false }
    })
    await handlers.get(ipcChannels.reindexAll)!(event())
    expect(ingestion.reindexAll).toHaveBeenCalledWith(watcher.getFiles())
    await handlers.get(ipcChannels.retryDocument)!(event(), document.id)
    expect(ingestion.retry).toHaveBeenCalledWith(path)
    await handlers.get(ipcChannels.revealCitation)!(event(), path)
    expect(revealFile).toHaveBeenCalledWith(path)
    await expect(handlers.get(ipcChannels.exportDiagnostics)!(event())).resolves.toBe(true)
    expect(exportDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ telemetryEnabled: false })
    )
    expect(handlers.get(ipcChannels.clearDiagnostics)!(event())).toMatchObject({
      operations: []
    })
    await expect(
      handlers.get(ipcChannels.revealCitation)!(event(), join(directory, 'unknown.txt'))
    ).rejects.toThrow('currently indexed')
    await expect(
      handlers.get(ipcChannels.getIndexStatus)!(event('https://attacker.test'))
    ).rejects.toThrow('untrusted sender')
  })
})
