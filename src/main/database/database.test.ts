import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from '@tursodatabase/database'
import type { Database } from '@tursodatabase/database'
import { afterEach, describe, expect, it } from 'vitest'
import { ChunkRepository } from './chunkRepository'
import { DatabaseService } from './database'
import { DocumentRepository } from './documentRepository'
import type { ChunkWrite, DocumentWrite } from './models'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

async function createDatabase(): Promise<{
  path: string
  service: DatabaseService
  database: Database
}> {
  const folder = await mkdtemp(join(tmpdir(), 'pc-agent-db-'))
  temporaryFolders.push(folder)
  const path = join(folder, 'knowledge-base.db')
  const service = new DatabaseService(path)
  const database = await service.open()
  return { path, service, database }
}

const document: DocumentWrite = {
  path: '/documents/example.md',
  name: 'example.md',
  watchedRoot: '/documents',
  mimeType: 'text/markdown',
  size: 20,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  contentHash: 'content',
  configFingerprint: 'configuration',
  status: 'indexed'
}

const chunk = (ordinal = 0): ChunkWrite => ({
  ordinal,
  content: `chunk ${ordinal}`,
  tokenCount: 2,
  startOffset: ordinal * 10,
  endOffset: ordinal * 10 + 7,
  heading: 'Heading',
  sourceKind: 'page',
  sourceIndex: ordinal + 1,
  sourceLabel: `Page ${ordinal + 1}`,
  embedding: [0.25, 0.5, 0.75],
  embeddingProvider: 'fake',
  embeddingModel: 'fake-v1',
  embeddingDimensions: 3
})

describe('knowledge-base database', () => {
  it('applies migrations once and persists documents across restarts', async () => {
    const { path, service, database } = await createDatabase()
    const documents = new DocumentRepository(database)
    await documents.upsert(document)
    expect(await database.all('SELECT version FROM schema_migrations')).toEqual([
      { version: 1 },
      { version: 2 }
    ])
    const columns = (await database.all('PRAGMA table_info(chunks)')) as Array<{ name: string }>
    expect(columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['source_kind', 'source_index', 'source_label'])
    )
    await service.close()

    const reopened = new DatabaseService(path)
    const reopenedDatabase = await reopened.open()
    expect((await new DocumentRepository(reopenedDatabase).getByPath(document.path))?.name).toBe(
      document.name
    )
    expect(await reopenedDatabase.all('SELECT version FROM schema_migrations')).toEqual([
      { version: 1 },
      { version: 2 }
    ])
    await reopened.close()
  })

  it('upgrades an existing version-one database without dropping chunks', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-db-v1-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'knowledge-base.db')
    const legacy = await connect(path)
    await legacy.exec(`
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-01-01');
      CREATE TABLE chunks(id TEXT PRIMARY KEY, content TEXT);
      INSERT INTO chunks(id, content) VALUES ('preserved', 'existing content');
    `)
    await legacy.close()

    const service = new DatabaseService(path)
    const database = await service.open()
    expect(await database.get("SELECT content FROM chunks WHERE id = 'preserved'")).toEqual({
      content: 'existing content'
    })
    const columns = (await database.all('PRAGMA table_info(chunks)')) as Array<{ name: string }>
    expect(columns.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['source_kind', 'source_index', 'source_label'])
    )
    await service.close()
  })

  it('atomically replaces chunks and cascades document deletion', async () => {
    const { service, database } = await createDatabase()
    const chunks = new ChunkRepository(database)
    const documents = new DocumentRepository(database)
    const first = await chunks.replaceDocument(document, [chunk(0), chunk(1)])
    expect(await chunks.listByDocument(first.id)).toEqual([
      expect.objectContaining({
        sourceKind: 'page',
        sourceIndex: 1,
        sourceLabel: 'Page 1'
      }),
      expect.objectContaining({ sourceIndex: 2 })
    ])

    const replaced = await chunks.replaceDocument({ ...document, contentHash: 'updated' }, [
      chunk(0)
    ])
    expect(await chunks.listByDocument(replaced.id)).toHaveLength(1)
    expect(replaced.contentHash).toBe('updated')

    await documents.deleteByPath(document.path)
    expect(await chunks.listByDocument(replaced.id)).toEqual([])
    await service.close()
  })

  it('rolls back a failed replacement and validates embedding dimensions', async () => {
    const { service, database } = await createDatabase()
    const chunks = new ChunkRepository(database)
    const original = await chunks.replaceDocument(document, [chunk(0)])

    await expect(
      chunks.replaceDocument({ ...document, contentHash: 'must-rollback' }, [chunk(0), chunk(0)])
    ).rejects.toThrow()
    const persisted = await new DocumentRepository(database).getByPath(document.path)
    expect(persisted?.contentHash).toBe('content')
    expect(await chunks.listByDocument(original.id)).toHaveLength(1)

    await expect(
      chunks.replaceDocument(document, [{ ...chunk(), embeddingDimensions: 4 }])
    ).rejects.toThrow('invalid embedding')
    await service.close()
  })
})
