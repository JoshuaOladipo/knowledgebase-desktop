import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ChunkRepository } from './chunkRepository'
import { DatabaseService } from './database'
import type { ChunkWrite, DocumentWrite } from './models'
import { TursoVectorRetriever } from './vectorRetriever'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

function document(
  path: string,
  root: string,
  status: DocumentWrite['status'] = 'indexed'
): DocumentWrite {
  return {
    path,
    name: path.split('/').at(-1)!,
    watchedRoot: root,
    mimeType: 'text/plain',
    size: 10,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    contentHash: path,
    configFingerprint: 'configuration',
    status
  }
}

function chunk(content: string, embedding: number[], ordinal = 0): ChunkWrite {
  return {
    ordinal,
    content,
    tokenCount: 2,
    startOffset: ordinal * 10,
    endOffset: ordinal * 10 + content.length,
    heading: 'Evidence',
    sourceKind: 'section',
    sourceIndex: 1,
    sourceLabel: 'Evidence',
    embedding,
    embeddingProvider: 'fake',
    embeddingModel: 'fake-v1',
    embeddingDimensions: 3
  }
}

describe('TursoVectorRetriever', () => {
  it('ranks compatible indexed chunks and applies root and document filters', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-retrieval-'))
    temporaryFolders.push(folder)
    const service = new DatabaseService(join(folder, 'retrieval.db'))
    const database = await service.open()
    const repository = new ChunkRepository(database)
    const first = await repository.replaceDocument(document('/one/a.txt', '/one'), [
      chunk('closest evidence', [1, 0, 0]),
      chunk('second evidence', [0.8, 0.2, 0], 1)
    ])
    await repository.replaceDocument(document('/two/b.txt', '/two'), [
      chunk('distant evidence', [0, 1, 0])
    ])
    await repository.replaceDocument(document('/one/error.txt', '/one', 'error'), [
      chunk('excluded evidence', [1, 0, 0])
    ])
    await repository.replaceDocument(document('/one/other-model.txt', '/one'), [
      { ...chunk('incompatible evidence', [1, 0, 0]), embeddingModel: 'other' }
    ])

    const retriever = new TursoVectorRetriever(database)
    const all = await retriever.retrieve({
      embedding: [1, 0, 0],
      embeddingProvider: 'fake',
      embeddingModel: 'fake-v1',
      embeddingDimensions: 3,
      limit: 10
    })
    expect(all.map(({ content }) => content)).toEqual([
      'closest evidence',
      'second evidence',
      'distant evidence'
    ])
    expect(all.map(({ rank }) => rank)).toEqual([1, 2, 3])
    expect(all[0]).toMatchObject({ documentId: first.id, documentPath: '/one/a.txt', distance: 0 })

    await expect(
      retriever.retrieve({
        embedding: [1, 0, 0],
        embeddingProvider: 'fake',
        embeddingModel: 'fake-v1',
        embeddingDimensions: 3,
        watchedRoots: ['/two']
      })
    ).resolves.toEqual([expect.objectContaining({ watchedRoot: '/two' })])
    await expect(
      retriever.retrieve({
        embedding: [1, 0, 0],
        embeddingProvider: 'fake',
        embeddingModel: 'fake-v1',
        embeddingDimensions: 3,
        documentIds: [first.id]
      })
    ).resolves.toHaveLength(2)
    await service.close()
  })

  it('rejects invalid limits, filters, and embedding configurations', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-retrieval-validation-'))
    temporaryFolders.push(folder)
    const service = new DatabaseService(join(folder, 'retrieval.db'))
    const retriever = new TursoVectorRetriever(await service.open())
    const valid = {
      embedding: [1, 0, 0],
      embeddingProvider: 'fake',
      embeddingModel: 'fake-v1',
      embeddingDimensions: 3
    }
    await expect(retriever.retrieve({ ...valid, limit: 0 })).rejects.toThrow('limit')
    await expect(retriever.retrieve({ ...valid, embeddingDimensions: 2 })).rejects.toThrow(
      'configuration'
    )
    await expect(retriever.retrieve({ ...valid, watchedRoots: [] })).rejects.toThrow(
      'Watched-root filter'
    )
    await service.close()
  })
})
