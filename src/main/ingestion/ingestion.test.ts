import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalHashEmbeddingProvider } from '../ai/providers/localHashEmbeddingProvider'
import type { EmbeddingProvider } from '../ai/embeddingProvider'
import { ChunkRepository } from '../database/chunkRepository'
import { DatabaseService } from '../database/database'
import { DocumentRepository } from '../database/documentRepository'
import { CHUNKER_VERSION, chunkText } from './chunkText'
import { contentHash, ingestionConfigurationFingerprint } from './contentHash'
import { extractMarkdown, markdownExtractor } from './extractors/markdown'
import { extractPlainText } from './extractors/plainText'
import { inspectFile, openFileSnapshot } from './filePolicy'
import { IngestionCoordinator } from './ingestionCoordinator'
import type { IngestionMutationStage } from './ingestionCoordinator'

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

class DeferredEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'deferred'
  readonly model = 'deferred-v1'
  readonly dimensions = 16
  readonly batchSize = 4
  started: Promise<void>
  private notifyStarted!: () => void
  private releaseWork!: () => void
  private readonly release = new Promise<void>((resolve) => {
    this.releaseWork = resolve
  })

  constructor() {
    this.started = new Promise<void>((resolve) => {
      this.notifyStarted = resolve
    })
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.notifyStarted()
    await this.release
    return new LocalHashEmbeddingProvider(this.dimensions, this.batchSize).embed(texts)
  }

  finish(): void {
    this.releaseWork()
  }
}

function mutationGate(target: IngestionMutationStage): {
  beforeMutation: (stage: IngestionMutationStage) => Promise<void>
  reached: Promise<void>
  release: () => void
} {
  let notifyReached!: () => void
  let releaseMutation!: () => void
  let intercepted = false
  const reached = new Promise<void>((resolve) => {
    notifyReached = resolve
  })
  const blocked = new Promise<void>((resolve) => {
    releaseMutation = resolve
  })
  return {
    beforeMutation: async (stage) => {
      if (stage !== target || intercepted) return
      intercepted = true
      notifyReached()
      await blocked
    },
    reached,
    release: releaseMutation
  }
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
    expect(
      (await extractPlainText({ path: textPath, type: 'text', bytes: await readFile(textPath) }))
        .text
    ).toBe('alpha\n\nbeta')
    const extracted = await extractMarkdown({
      path: markdownPath,
      type: 'markdown',
      bytes: await readFile(markdownPath)
    })
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

  it('rejects final and intermediate symlinks and reads one bounded snapshot', async () => {
    const root = await temporaryFolder()
    const outside = await temporaryFolder()
    const externalFile = join(outside, 'external.txt')
    await writeFile(externalFile, 'external secret')
    const finalLink = join(root, 'final.txt')
    const directoryLink = join(root, 'linked')
    await symlink(externalFile, finalLink)
    await symlink(outside, directoryLink)

    expect(await openFileSnapshot(finalLink, root)).toMatchObject({
      accepted: false,
      reason: 'symlink'
    })
    expect(await openFileSnapshot(join(directoryLink, 'external.txt'), root)).toMatchObject({
      accepted: false,
      reason: 'symlink'
    })

    const regular = join(root, 'regular.txt')
    await writeFile(regular, 'bounded content')
    const snapshot = await openFileSnapshot(regular, root)
    expect('bytes' in snapshot && new TextDecoder().decode(snapshot.bytes)).toBe('bounded content')
    expect(await openFileSnapshot(regular, root, { maximumBytes: 2 })).toMatchObject({
      accepted: false,
      reason: 'oversized'
    })
  })

  it('rejects path replacement and removal during identity validation', async () => {
    const root = await temporaryFolder()
    const outside = await temporaryFolder()
    const external = join(outside, 'external.txt')
    await writeFile(external, 'external secret')
    const swapped = join(root, 'swapped.txt')
    const original = join(root, 'original.txt')
    await writeFile(swapped, 'safe content')
    expect(
      await openFileSnapshot(swapped, root, {
        beforeIdentityCheck: async () => {
          await rename(swapped, original)
          await symlink(external, swapped)
        }
      })
    ).toMatchObject({ accepted: false, reason: 'symlink' })

    const removed = join(root, 'removed.txt')
    await writeFile(removed, 'removed during validation')
    expect(
      await openFileSnapshot(removed, root, {
        beforeIdentityCheck: async () => rm(removed)
      })
    ).toMatchObject({ accepted: false, reason: 'unreadable' })
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

  it('assigns a file to the most specific active nested root', async () => {
    const root = await temporaryFolder()
    const nested = join(root, 'nested')
    await mkdir(nested)
    const path = join(nested, 'knowledge.txt')
    await writeFile(path, 'Nested roots use the most specific managed identity.')
    const service = new DatabaseService(join(root, 'nested-root.db'))
    const database = await service.open()
    const coordinator = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    coordinator.setActiveRoots([root, nested])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'knowledge.txt',
        size: 52,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await coordinator.onIdle()
    expect((await new DocumentRepository(database).getByPath(path))?.watchedRoot).toBe(nested)
    await coordinator.close()
    await service.close()
  })

  it('atomically clears chunks for empty replacements and removes records with their root', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'knowledge.md')
    await writeFile(path, '# Knowledge\n\nInitially indexable content.')
    const service = new DatabaseService(join(root, 'empty-test.db'))
    const database = await service.open()
    const coordinator = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    const event = {
      type: 'change' as const,
      path,
      entry: {
        path,
        name: 'knowledge.md',
        size: 1,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    }
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent(event)
    await coordinator.onIdle()
    const documents = new DocumentRepository(database)
    const chunks = new ChunkRepository(database)
    const indexed = await documents.getByPath(path)
    expect(await chunks.listByDocument(indexed!.id)).not.toHaveLength(0)

    await writeFile(path, '   \n')
    coordinator.handleFileEvent(event)
    await coordinator.onIdle()
    const empty = await documents.getByPath(path)
    expect(empty?.status).toBe('skipped')
    expect(await chunks.listByDocument(empty!.id)).toEqual([])

    coordinator.setActiveRoots([])
    await coordinator.onIdle()
    expect(await documents.getByPath(path)).toBeNull()
    await coordinator.close()
    await service.close()
  })

  it('cannot resurrect a document deleted while embedding is in flight', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'delete-race.md')
    await writeFile(path, '# Race\n\nContent waiting for delayed embeddings.')
    const service = new DatabaseService(join(root, 'delete-race.db'))
    const database = await service.open()
    const provider = new DeferredEmbeddingProvider()
    const coordinator = new IngestionCoordinator(database, provider, {
      stabilizationDelayMs: 0
    })
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'delete-race.md',
        size: 50,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await provider.started
    coordinator.handleFileEvent({ type: 'unlink', path })
    provider.finish()
    await coordinator.onIdle()
    expect(await new DocumentRepository(database).getByPath(path)).toBeNull()
    await coordinator.close()
    await service.close()
  })

  it.each(['queued-status', 'replacement'] as const)(
    'cannot resurrect a document deleted during a %s mutation',
    async (stage) => {
      const root = await temporaryFolder()
      const path = join(root, `${stage}.md`)
      await writeFile(path, '# Race\n\nA deletion must supersede this pending mutation.')
      const service = new DatabaseService(join(root, `${stage}.db`))
      const database = await service.open()
      const gate = mutationGate(stage)
      const coordinator = new IngestionCoordinator(
        database,
        new LocalHashEmbeddingProvider(16, 4),
        { stabilizationDelayMs: 0, beforeMutation: gate.beforeMutation }
      )
      coordinator.setActiveRoots([root])
      coordinator.handleFileEvent({
        type: 'add',
        path,
        entry: {
          path,
          name: `${stage}.md`,
          size: 56,
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          isDirectory: false
        }
      })

      await gate.reached
      coordinator.handleFileEvent({ type: 'unlink', path })
      gate.release()
      await coordinator.onIdle()

      expect(await new DocumentRepository(database).getByPath(path)).toBeNull()
      await coordinator.close()
      await service.close()
    }
  )

  it('lets a newer generation supersede an older atomic replacement', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'replacement-change.md')
    await writeFile(path, '# Old\n\nThe old generation must never become durable.')
    const service = new DatabaseService(join(root, 'replacement-change.db'))
    const database = await service.open()
    const gate = mutationGate('replacement')
    const coordinator = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0,
      beforeMutation: gate.beforeMutation
    })
    const entry = {
      path,
      name: 'replacement-change.md',
      size: 52,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      isDirectory: false
    }
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({ type: 'add', path, entry })

    await gate.reached
    await writeFile(path, '# New\n\nOnly the newest generation may become durable.')
    coordinator.handleFileEvent({ type: 'change', path, entry })
    gate.release()
    await coordinator.onIdle()

    const document = await new DocumentRepository(database).getByPath(path)
    const chunks = await new ChunkRepository(database).listByDocument(document!.id)
    expect(document?.contentHash).toBe(contentHash(await readFile(path)))
    expect(chunks.map(({ content }) => content).join('\n')).toContain('newest generation')
    expect(chunks.map(({ content }) => content).join('\n')).not.toContain('old generation')
    await coordinator.close()
    await service.close()
  })

  it('cannot commit after its active root is removed during embedding', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'root-race.md')
    await writeFile(path, '# Race\n\nContent waiting for delayed embeddings.')
    const service = new DatabaseService(join(root, 'root-race.db'))
    const database = await service.open()
    const provider = new DeferredEmbeddingProvider()
    const coordinator = new IngestionCoordinator(database, provider, {
      stabilizationDelayMs: 0
    })
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'root-race.md',
        size: 50,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await provider.started
    coordinator.setActiveRoots([])
    provider.finish()
    await coordinator.onIdle()
    expect(await new DocumentRepository(database).getByPath(path)).toBeNull()
    await coordinator.close()
    await service.close()
  })

  it('lets a newer change supersede embedding work and commits only the latest bytes', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'newer-change.md')
    await writeFile(path, '# First\n\nOriginal content waiting for embeddings.')
    const service = new DatabaseService(join(root, 'newer-change.db'))
    const database = await service.open()
    const provider = new DeferredEmbeddingProvider()
    const coordinator = new IngestionCoordinator(database, provider, { stabilizationDelayMs: 0 })
    const entry = {
      path,
      name: 'newer-change.md',
      size: 50,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      isDirectory: false
    }
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({ type: 'add', path, entry })
    await provider.started
    await writeFile(path, '# Second\n\nOnly the newest content may be committed.')
    coordinator.handleFileEvent({ type: 'change', path, entry })
    provider.finish()
    await coordinator.onIdle()

    const document = await new DocumentRepository(database).getByPath(path)
    const chunks = await new ChunkRepository(database).listByDocument(document!.id)
    expect(document?.contentHash).toBe(contentHash(await readFile(path)))
    expect(chunks.map(({ content }) => content).join('\n')).toContain('newest content')
    expect(chunks.map(({ content }) => content).join('\n')).not.toContain('Original content')
    await coordinator.close()
    await service.close()
  })

  it('reconciles content changed while the application was closed', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'offline-change.md')
    await writeFile(path, '# Before\n\nContent before restart.')
    const service = new DatabaseService(join(root, 'offline-change.db'))
    const database = await service.open()
    const first = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    const entry = {
      path,
      name: 'offline-change.md',
      size: 32,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      isDirectory: false
    }
    first.setActiveRoots([root])
    first.handleFileEvent({ type: 'add', path, entry })
    await first.onIdle()
    const before = await new DocumentRepository(database).getByPath(path)
    await first.close()

    await writeFile(path, '# After\n\nContent changed while closed.')
    const restarted = new IngestionCoordinator(database, new LocalHashEmbeddingProvider(16, 4), {
      stabilizationDelayMs: 0
    })
    await restarted.reconcile([root], [{ ...entry, modifiedAt: new Date().toISOString() }])
    await restarted.onIdle()
    const after = await new DocumentRepository(database).getByPath(path)
    expect(after?.contentHash).not.toBe(before?.contentHash)
    expect(after?.contentHash).toBe(contentHash(await readFile(path)))
    await restarted.close()
    await service.close()
  })

  it('aborts in-flight embedding and drains before shutdown completes', async () => {
    const root = await temporaryFolder()
    const path = join(root, 'shutdown.md')
    await writeFile(path, '# Shutdown\n\nEmbedding must not commit after close starts.')
    const service = new DatabaseService(join(root, 'shutdown.db'))
    const database = await service.open()
    const provider = new DeferredEmbeddingProvider()
    const coordinator = new IngestionCoordinator(database, provider, { stabilizationDelayMs: 0 })
    coordinator.setActiveRoots([root])
    coordinator.handleFileEvent({
      type: 'add',
      path,
      entry: {
        path,
        name: 'shutdown.md',
        size: 55,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        isDirectory: false
      }
    })
    await provider.started
    const closing = coordinator.close()
    provider.finish()
    await closing
    const document = await new DocumentRepository(database).getByPath(path)
    expect(document?.status).not.toBe('indexed')
    expect(document ? await new ChunkRepository(database).listByDocument(document.id) : []).toEqual(
      []
    )
    await service.close()
  })
})
