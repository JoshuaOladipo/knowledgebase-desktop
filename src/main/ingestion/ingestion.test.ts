import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalHashEmbeddingProvider } from '../ai/providers/localHashEmbeddingProvider'
import { ChunkRepository } from '../database/chunkRepository'
import { DatabaseService } from '../database/database'
import { DocumentRepository } from '../database/documentRepository'
import { CHUNKER_VERSION, chunkText } from './chunkText'
import { contentHash, ingestionConfigurationFingerprint } from './contentHash'
import { extractMarkdown, markdownExtractor } from './extractors/markdown'
import { extractPlainText } from './extractors/plainText'
import { inspectFile } from './filePolicy'
import { IngestionCoordinator } from './ingestionCoordinator'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'pc-agent-ingestion-'))
  temporaryFolders.push(folder)
  return folder
}

describe('ingestion primitives', () => {
  it('classifies supported, unsupported, oversized, and binary files', async () => {
    const root = await temporaryFolder()
    const markdown = join(root, 'notes.md')
    await writeFile(markdown, '# Notes\n\nReadable')
    expect(await inspectFile(markdown, root)).toMatchObject({
      accepted: true,
      type: 'markdown'
    })

    const unsupported = join(root, 'image.png')
    await writeFile(unsupported, 'not actually an image')
    expect(await inspectFile(unsupported, root)).toMatchObject({
      accepted: false,
      reason: 'unsupported'
    })
    expect(await inspectFile(markdown, root, { maximumBytes: 1 })).toMatchObject({
      accepted: false,
      reason: 'oversized'
    })

    const binary = join(root, 'binary.txt')
    await writeFile(binary, Buffer.from([1, 0, 2]))
    expect(await inspectFile(binary, root)).toMatchObject({
      accepted: false,
      reason: 'binary'
    })

    const office = join(root, 'document.docx')
    await writeFile(office, Buffer.from([80, 75, 0, 0]))
    expect(await inspectFile(office, root)).toMatchObject({
      accepted: true,
      type: 'docx'
    })

    const legacy = join(root, 'legacy.doc')
    await writeFile(legacy, 'legacy')
    expect(await inspectFile(legacy, root)).toMatchObject({
      accepted: false,
      reason: 'unsupported'
    })
  })

  it('extracts deterministic sections and chunks on document structure', async () => {
    const root = await temporaryFolder()
    const textPath = join(root, 'content.txt')
    const markdownPath = join(root, 'content.md')
    await writeFile(textPath, 'alpha\r\n\r\nbeta  \n')
    await writeFile(markdownPath, '# First\n\nAlpha text.\n\n## Second\n\nBeta text.')
    expect((await extractPlainText({ path: textPath, type: 'text' })).text).toBe('alpha\n\nbeta')
    const extracted = await extractMarkdown({ path: markdownPath, type: 'markdown' })
    expect(extracted.sections.map(({ heading }) => heading)).toEqual(['First', 'Second'])
    const chunks = chunkText(extracted, {
      targetTokens: 10,
      overlapTokens: 2,
      minimumTokens: 1
    })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks.map(({ ordinal }) => ordinal)).toEqual(chunks.map((_, index) => index))
    expect(chunks.every(({ content }) => content.length > 0)).toBe(true)
  })

  it('creates stable content and configuration fingerprints', () => {
    expect(contentHash('same')).toBe(contentHash('same'))
    expect(
      ingestionConfigurationFingerprint({
        extractorVersion: markdownExtractor.version,
        chunkerVersion: CHUNKER_VERSION,
        embeddingFingerprint: 'one'
      })
    ).not.toBe(
      ingestionConfigurationFingerprint({
        extractorVersion: markdownExtractor.version,
        chunkerVersion: CHUNKER_VERSION,
        embeddingFingerprint: 'two'
      })
    )
  })
})

describe('ingestion coordinator', () => {
  it('indexes, skips unchanged content, reindexes changes, and removes deleted records', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'knowledge.md')
    await writeFile(path, '# Knowledge\n\nThis is enough text to index for a deterministic test.')
    const service = new DatabaseService(join(root, 'test.db'))
    const database = await service.open()
    const coordinator = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'knowledge.md',
        size: 65,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await coordinator.onIdle()

    const documents = new DocumentRepository(database)
    const chunks = new ChunkRepository(database)
    const indexed = await documents.getByPath(path)
    expect(indexed?.status).toBe('indexed')
    expect(await chunks.listByDocument(indexed!.id)).not.toHaveLength(0)

    const originalChunks = await chunks.listByDocument(indexed!.id)
    coordinator.handleFileEvent({
      type: 'change',
      path,
      entry: { ...indexed!, isDirectory: false }
    })
    await coordinator.onIdle()
    expect(await chunks.listByDocument(indexed!.id)).toEqual(originalChunks)

    await writeFile(path, '# Knowledge\n\nThe content changed and must be indexed again.')
    coordinator.handleFileEvent({
      type: 'change',
      path,
      entry: { ...indexed!, isDirectory: false }
    })
    await coordinator.onIdle()
    expect((await documents.getByPath(path))?.contentHash).not.toBe(indexed?.contentHash)

    coordinator.handleFileEvent({ type: 'unlink', path })
    await coordinator.onIdle()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(await documents.getByPath(path)).toBeNull()
    await coordinator.close()
    await service.close()
  })

  it('indexes OfficeParser documents and persists generalized source metadata', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'document.rtf')
    const fixture = new URL('./fixtures/sample.rtf', import.meta.url)
    await writeFile(path, await readFile(fixture))
    const service = new DatabaseService(join(root, 'office-test.db'))
    const database = await service.open()
    const coordinator = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'document.rtf',
        size: 1,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await coordinator.onIdle()

    const document = await new DocumentRepository(database).getByPath(path)
    expect(document?.status).toBe('indexed')
    expect(document?.mimeType).toBe('application/rtf')
    const chunks = await new ChunkRepository(database).listByDocument(document!.id)
    expect(chunks).not.toHaveLength(0)
    expect(chunks[0].sourceKind).toBe('section')
    await coordinator.close()
    await service.close()
  })
})
