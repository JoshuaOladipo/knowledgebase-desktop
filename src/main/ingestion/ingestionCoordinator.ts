import { readFile, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { basename, relative, resolve, sep } from 'node:path'
import type { FileEntry, FileEvent } from '../../shared/contracts'
import type { EmbeddingProvider } from '../ai/embeddingProvider'
import { embedInBatches } from '../ai/embeddingProvider'
import { ChunkRepository } from '../database/chunkRepository'
import { DocumentRepository } from '../database/documentRepository'
import type { DocumentStatus, DocumentWrite } from '../database/models'
import { embeddingConfigurationFingerprint } from '../config/aiSettings'
import { CHUNKER_VERSION, chunkText } from './chunkText'
import { contentHash, ingestionConfigurationFingerprint } from './contentHash'
import { extractorVersion, extractText } from './extractText'
import { inspectFile } from './filePolicy'
import { IngestionQueue } from './ingestionQueue'

export interface IngestionCoordinatorOptions {
  concurrency?: number
  stabilizationDelayMs?: number
}

function abortError(): DOMException {
  return new DOMException('Ingestion was cancelled.', 'AbortError')
}

export function pathIsInside(root: string, path: string): boolean {
  const result = relative(resolve(root), resolve(path))
  return (
    result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !result.startsWith(sep))
  )
}

export class IngestionCoordinator {
  private readonly queue: IngestionQueue
  private readonly documents: DocumentRepository
  private readonly chunks: ChunkRepository
  private activeRoots: string[] = []
  private readonly stabilizationDelayMs: number

  constructor(
    database: ConstructorParameters<typeof DocumentRepository>[0],
    private readonly embeddingProvider: EmbeddingProvider,
    options: IngestionCoordinatorOptions = {}
  ) {
    this.documents = new DocumentRepository(database)
    this.chunks = new ChunkRepository(database)
    this.stabilizationDelayMs = options.stabilizationDelayMs ?? 250
    this.queue = new IngestionQueue(
      (job, generation, signal) =>
        this.process(job.path, job.watchedRoot, generation, signal, job.force),
      options.concurrency ?? 2
    )
  }

  setActiveRoots(roots: string[]): void {
    this.activeRoots = [...roots]
    this.queue.cancelOutsideRoots(roots, pathIsInside)
  }

  handleFileEvent(event: FileEvent): void {
    if (event.type === 'unlink') {
      this.queue.cancel(event.path)
      void this.documents.deleteByPath(event.path)
      return
    }
    if (!event.entry || event.entry.isDirectory) return
    const watchedRoot = this.findRoot(event.path)
    if (watchedRoot) this.queue.enqueue({ path: event.path, watchedRoot })
  }

  /** Removes stale records and enqueues new or changed files after watcher startup. */
  async reconcile(roots: string[], files: FileEntry[]): Promise<void> {
    this.setActiveRoots(roots)
    const currentPaths = new Set(files.filter((file) => !file.isDirectory).map((file) => file.path))
    for (const document of await this.documents.list()) {
      if (
        roots.some((root) => pathIsInside(root, document.path)) &&
        !currentPaths.has(document.path)
      ) {
        this.queue.cancel(document.path)
        await this.documents.deleteByPath(document.path)
      }
    }
    for (const file of files) {
      if (file.isDirectory) continue
      const watchedRoot = this.findRoot(file.path)
      if (watchedRoot) this.queue.enqueue({ path: file.path, watchedRoot })
    }
  }

  /** Forces every currently visible supported file through the latest configuration. */
  reindexAll(files: FileEntry[]): void {
    for (const file of files) {
      if (file.isDirectory) continue
      const watchedRoot = this.findRoot(file.path)
      if (watchedRoot) this.queue.enqueue({ path: file.path, watchedRoot, force: true })
    }
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle()
  }

  async close(): Promise<void> {
    await this.queue.close()
  }

  private findRoot(path: string): string | undefined {
    return this.activeRoots
      .filter((root) => pathIsInside(root, path))
      .sort((left, right) => right.length - left.length)[0]
  }

  private async writeStatus(
    path: string,
    watchedRoot: string,
    status: DocumentStatus,
    error: string | null = null
  ): Promise<void> {
    const details = await stat(path).catch(() => null)
    const existing = await this.documents.getByPath(path)
    await this.documents.upsert({
      path,
      name: basename(path),
      watchedRoot,
      mimeType: existing?.mimeType ?? 'application/octet-stream',
      size: details?.size ?? existing?.size ?? 0,
      modifiedAt: details?.mtime.toISOString() ?? existing?.modifiedAt ?? new Date().toISOString(),
      contentHash: existing?.contentHash,
      configFingerprint: existing?.configFingerprint,
      status,
      error
    })
  }

  private assertCurrent(path: string, generation: number, signal: AbortSignal): void {
    if (signal.aborted || !this.queue.isCurrent(path, generation)) throw abortError()
  }

  private async stableStat(path: string, signal: AbortSignal): Promise<Stats> {
    const first = await stat(path)
    if (this.stabilizationDelayMs > 0) {
      await new Promise<void>((resolveDelay, reject) => {
        const timeout = setTimeout(resolveDelay, this.stabilizationDelayMs)
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout)
            reject(abortError())
          },
          { once: true }
        )
      })
    }
    const second = await stat(path)
    if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) {
      throw Object.assign(new Error('File is still changing.'), { transient: true })
    }
    return second
  }

  private async process(
    path: string,
    watchedRoot: string,
    generation: number,
    signal: AbortSignal,
    force = false
  ): Promise<void> {
    try {
      await this.writeStatus(path, watchedRoot, 'queued')
      const policy = await inspectFile(path, watchedRoot)
      this.assertCurrent(path, generation, signal)
      if (!policy.accepted || !policy.type || !policy.mimeType) {
        await this.writeStatus(
          path,
          watchedRoot,
          'skipped',
          policy.message ?? policy.reason ?? null
        )
        return
      }

      const details = await this.stableStat(path, signal)
      const bytes = await readFile(path)
      const hash = contentHash(bytes)
      const fingerprint = ingestionConfigurationFingerprint({
        extractorVersion: extractorVersion(policy.type),
        chunkerVersion: CHUNKER_VERSION,
        embeddingFingerprint: embeddingConfigurationFingerprint(this.embeddingProvider)
      })
      const existing = await this.documents.getByPath(path)
      if (!force && existing?.contentHash === hash && existing.configFingerprint === fingerprint) {
        await this.documents.updateStatus(path, 'indexed')
        return
      }

      await this.writeStatus(path, watchedRoot, 'extracting')
      const extracted = await extractText({ path, type: policy.type, signal })
      this.assertCurrent(path, generation, signal)
      await this.writeStatus(path, watchedRoot, 'chunking')
      const chunks = chunkText(extracted)
      if (chunks.length === 0) {
        await this.documents.upsert({
          path,
          name: basename(path),
          watchedRoot,
          mimeType: policy.mimeType,
          size: details.size,
          modifiedAt: details.mtime.toISOString(),
          contentHash: hash,
          configFingerprint: fingerprint,
          status: 'skipped',
          error: 'Document contains no indexable text.'
        })
        return
      }

      await this.writeStatus(path, watchedRoot, 'embedding')
      const embeddings = await embedInBatches(
        this.embeddingProvider,
        chunks.map((chunk) => chunk.content),
        signal
      )
      this.assertCurrent(path, generation, signal)
      const document: DocumentWrite = {
        path,
        name: basename(path),
        watchedRoot,
        mimeType: policy.mimeType,
        size: details.size,
        modifiedAt: details.mtime.toISOString(),
        contentHash: hash,
        configFingerprint: fingerprint,
        status: 'indexed',
        error: null
      }
      await this.chunks.replaceDocument(
        document,
        chunks.map((chunk, index) => ({
          ...chunk,
          pageNumber: chunk.sourceKind === 'page' ? chunk.sourceIndex : null,
          embedding: embeddings[index],
          embeddingProvider: this.embeddingProvider.id,
          embeddingModel: this.embeddingProvider.model,
          embeddingDimensions: this.embeddingProvider.dimensions
        }))
      )
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      if ((error as { transient?: boolean }).transient) {
        if (this.queue.isCurrent(path, generation)) this.queue.enqueue({ path, watchedRoot, force })
        return
      }
      if (this.queue.isCurrent(path, generation)) {
        await this.writeStatus(path, watchedRoot, 'error', String(error)).catch(() => undefined)
      }
    }
  }
}
