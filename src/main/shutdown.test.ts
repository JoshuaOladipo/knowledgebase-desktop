import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalHashEmbeddingProvider } from './ai/providers/localHashEmbeddingProvider'
import { ChunkRepository } from './database/chunkRepository'
import { DatabaseService } from './database/database'
import { DocumentRepository } from './database/documentRepository'
import { IngestionCoordinator } from './ingestion/ingestionCoordinator'
import { shutdownApplicationServices } from './shutdown'
import { WatcherService } from './watcher'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

async function temporaryFolder(prefix: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), prefix))
  temporaryFolders.push(folder)
  return folder
}

describe('application shutdown', () => {
  it('preserves indexed documents and chunks across watcher shutdown and database reopen', async () => {
    const root = await temporaryFolder('pc-agent-shutdown-root-')
    const state = await temporaryFolder('pc-agent-shutdown-state-')
    const path = join(root, 'durable.md')
    const databasePath = join(state, 'knowledge-base.db')
    await writeFile(
      path,
      '# Durable index\n\nThe persisted knowledge base must survive a normal application quit.'
    )

    const databaseService = new DatabaseService(databasePath)
    const database = await databaseService.open()
    const ingestion = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(32, 4), {
      stabilizationDelayMs: 0
    })
    let ready!: () => void
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve
    })
    const watcher = new WatcherService(
      (event) => ingestion.handleFileEvent(event),
      (watcherState) => {
        ingestion.setActiveRoots(watcherState.folders)
        if (watcherState.phase === 'watching') {
          void ingestion.reconcile(watcherState.folders, watcher.getFiles()).then(ready)
        }
      }
    )

    await watcher.start([root])
    await readyPromise
    await ingestion.onIdle()
    const indexed = await new DocumentRepository(database).getByPath(path)
    expect(indexed?.status).toBe('indexed')
    expect(await new ChunkRepository(database).listByDocument(indexed!.id)).not.toHaveLength(0)

    await shutdownApplicationServices({ watcher, ingestion, database: databaseService })

    const reopenedService = new DatabaseService(databasePath)
    const reopened = await reopenedService.open()
    const persisted = await new DocumentRepository(reopened).getByPath(path)
    expect(persisted?.status).toBe('indexed')
    expect(await new ChunkRepository(reopened).listByDocument(persisted!.id)).not.toHaveLength(0)
    await reopenedService.close()
  })

  it('attempts every close step when an earlier service fails', async () => {
    const calls: string[] = []
    const services = {
      watcher: {
        shutdown: vi.fn(async () => {
          calls.push('watcher')
          throw new Error('watcher close failed')
        })
      },
      ingestion: {
        close: vi.fn(async () => {
          calls.push('ingestion')
        })
      },
      database: {
        close: vi.fn(async () => {
          calls.push('database')
        })
      }
    }

    await expect(shutdownApplicationServices(services)).rejects.toThrow(
      'application services could not close cleanly'
    )
    expect(calls).toEqual(['watcher', 'ingestion', 'database'])
  })
})
