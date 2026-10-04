import { basename, relative, resolve, sep } from 'node:path'
import type { FileEntry, FileEvent } from '../../shared/contracts'
import type { EmbeddingProvider } from '../ai/embeddingProvider'
import { embedInBatches } from '../ai/embeddingProvider'
import type { OperationMetricRecorder, OperationOutcome } from '../ai/operationMetrics'
import { measureOperation } from '../ai/operationMetrics'
import { ChunkRepository } from '../database/chunkRepository'
import { DocumentRepository } from '../database/documentRepository'
import type { DocumentStatus, DocumentWrite } from '../database/models'
import { embeddingConfigurationFingerprint } from '../config/aiSettings'
import { CHUNKER_VERSION, chunkText } from './chunkText'
import { contentHash, ingestionConfigurationFingerprint } from './contentHash'
import { extractorVersion, extractText } from './extractText'
import { openFileSnapshot } from './filePolicy'
import { IngestionQueue } from './ingestionQueue'

export interface IngestionCoordinatorOptions {
  concurrency?: number
  stabilizationDelayMs?: number
  metrics?: OperationMetricRecorder
  /** Optional deterministic barrier used by race tests before serialized mutations commit. */
  beforeMutation?: (stage: IngestionMutationStage, path: string) => Promise<void>
}

export type IngestionMutationStage =
  | 'queued-status'
  | 'extracting-status'
  | 'chunking-status'
  | 'embedding-status'
  | 'replacement'
  | 'error-status'

const MAINTENANCE_ERROR_MESSAGE =
  'Index maintenance failed. Retry indexing or restart the application.'

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
  private readonly metrics?: OperationMetricRecorder
  private readonly beforeMutation?: IngestionCoordinatorOptions['beforeMutation']
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly backgroundMutations = new Set<Promise<void>>()
  private maintenanceError: string | null = null

  constructor(
    database: ConstructorParameters<typeof DocumentRepository>[0],
    private readonly embeddingProvider: EmbeddingProvider,
    options: IngestionCoordinatorOptions = {}
  ) {
    this.documents = new DocumentRepository(database)
    this.chunks = new ChunkRepository(database)
    this.stabilizationDelayMs = options.stabilizationDelayMs ?? 250
    this.metrics = options.metrics
    this.beforeMutation = options.beforeMutation
    this.queue = new IngestionQueue(
      (job, generation, signal) =>
        this.process(job.path, job.watchedRoot, generation, signal, job.force),
      options.concurrency ?? 2
    )
  }

  setActiveRoots(roots: string[]): void {
    this.activeRoots = [...roots]
    this.queue.cancelOutsideRoots(roots, pathIsInside)
    this.runBackgroundMutation(async () => {
      for (const document of await this.documents.list()) {
        if (!roots.some((root) => pathIsInside(root, document.path))) {
          await this.documents.deleteByPath(document.path)
        }
      }
    })
  }

  handleFileEvent(event: FileEvent): void {
    if (event.type === 'unlink') {
      this.queue.cancel(event.path)
      this.runBackgroundMutation(() => this.documents.deleteByPath(event.path))
      return
    }
    if (!event.entry || event.entry.isDirectory) return
    const watchedRoot = this.findRoot(event.path)
    if (watchedRoot) this.enqueue(event.path, watchedRoot)
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
        await this.serializeMutation(() => this.documents.deleteByPath(document.path))
      }
    }
    for (const file of files) {
      if (file.isDirectory) continue
      const watchedRoot = this.findRoot(file.path)
      if (watchedRoot) this.enqueue(file.path, watchedRoot)
    }
  }

  /** Forces every currently visible supported file through the latest configuration. */
  reindexAll(files: FileEntry[]): void {
    this.maintenanceError = null
    for (const file of files) {
      if (file.isDirectory) continue
      const watchedRoot = this.findRoot(file.path)
      if (watchedRoot) this.enqueue(file.path, watchedRoot, true)
    }
  }

  retry(path: string): void {
    const watchedRoot = this.findRoot(path)
    if (!watchedRoot) throw new Error('Document is outside the active watched roots.')
    this.maintenanceError = null
    this.enqueue(path, watchedRoot, true)
  }

  getQueueState(): { pendingJobs: number; activeWorkers: number; maintenanceError: string | null } {
    return { ...this.queue.getState(), maintenanceError: this.maintenanceError }
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle()
    await this.mutationTail
    await Promise.all([...this.backgroundMutations])
  }

  async close(): Promise<void> {
    await this.queue.close()
    await this.mutationTail
    await Promise.all([...this.backgroundMutations])
  }

  private findRoot(path: string): string | undefined {
    return this.activeRoots
      .filter((root) => pathIsInside(root, path))
      .sort((left, right) => right.length - left.length)[0]
  }

  private enqueue(path: string, watchedRoot: string, force = false): void {
    const generation = this.queue.enqueue({ path, watchedRoot, force })
    this.runBackgroundMutation(async () => {
      await this.beforeMutation?.('queued-status', path)
      if (
        this.queue.isCurrent(path, generation) &&
        this.activeRoots.some((root) => pathIsInside(root, path))
      ) {
        const existing = await this.documents.getByPath(path)
        if (force || existing?.status !== 'indexed') {
          await this.writeStatus(path, watchedRoot, 'queued')
        }
      }
    })
  }

  private async writeStatus(
    path: string,
    watchedRoot: string,
    status: DocumentStatus,
    error: string | null = null
  ): Promise<void> {
    const existing = await this.documents.getByPath(path)
    await this.documents.upsert({
      path,
      name: basename(path),
      watchedRoot,
      mimeType: existing?.mimeType ?? 'application/octet-stream',
      size: existing?.size ?? 0,
      modifiedAt: existing?.modifiedAt ?? new Date().toISOString(),
      contentHash: existing?.contentHash,
      configFingerprint: existing?.configFingerprint,
      status,
      error
    })
  }

  private assertCurrent(path: string, generation: number, signal: AbortSignal): void {
    if (
      signal.aborted ||
      !this.queue.isCurrent(path, generation) ||
      !this.activeRoots.some((root) => pathIsInside(root, path))
    ) {
      throw abortError()
    }
  }

  private async stabilize(signal: AbortSignal): Promise<void> {
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
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation)
    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  /** Tracks non-awaited maintenance writes and exposes sanitized failures through index state. */
  private runBackgroundMutation(operation: () => Promise<void>): void {
    const mutation = this.serializeMutation(operation).then(
      () => undefined,
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          this.maintenanceError = MAINTENANCE_ERROR_MESSAGE
          this.metrics?.record('index-maintenance', 0, 'failure')
        }
      }
    )
    this.backgroundMutations.add(mutation)
    void mutation.finally(() => this.backgroundMutations.delete(mutation))
  }

  private mutateIfCurrent<T>(
    path: string,
    generation: number,
    signal: AbortSignal,
    stage: IngestionMutationStage,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.serializeMutation(async () => {
      await this.beforeMutation?.(stage, path)
      this.assertCurrent(path, generation, signal)
      return operation()
    })
  }

  private async process(
    path: string,
    watchedRoot: string,
    generation: number,
    signal: AbortSignal,
    force = false
  ): Promise<void> {
    const startedAt = performance.now()
    let outcome: OperationOutcome = 'success'
    try {
      await this.stabilize(signal)
      const policy = await openFileSnapshot(path, watchedRoot)
      this.assertCurrent(path, generation, signal)
      if ('accepted' in policy) {
        outcome = 'skipped'
        const existing = await this.documents.getByPath(path)
        if (policy.reason === 'unreadable') {
          await this.mutateIfCurrent(path, generation, signal, 'error-status', () =>
            this.writeStatus(path, watchedRoot, 'error', policy.message ?? policy.reason ?? null)
          )
        } else {
          await this.mutateIfCurrent(path, generation, signal, 'replacement', () =>
            this.chunks.replaceDocument(
              {
                path,
                name: basename(path),
                watchedRoot,
                mimeType: existing?.mimeType ?? 'application/octet-stream',
                size: existing?.size ?? 0,
                modifiedAt: existing?.modifiedAt ?? new Date().toISOString(),
                contentHash: null,
                configFingerprint: null,
                status: 'skipped',
                error: policy.message ?? policy.reason ?? null
              },
              []
            )
          )
        }
        return
      }

      const { bytes, details } = policy
      const hash = contentHash(bytes)
      const fingerprint = ingestionConfigurationFingerprint({
        extractorVersion: extractorVersion(policy.type),
        chunkerVersion: CHUNKER_VERSION,
        embeddingFingerprint: embeddingConfigurationFingerprint(this.embeddingProvider)
      })
      const existing = await this.documents.getByPath(path)
      if (
        !force &&
        existing?.status === 'indexed' &&
        existing.contentHash === hash &&
        existing.configFingerprint === fingerprint
      ) {
        outcome = 'skipped'
        return
      }

      await this.mutateIfCurrent(path, generation, signal, 'extracting-status', () =>
        this.writeStatus(path, watchedRoot, 'extracting')
      )
      const extracted = await extractText({ path, type: policy.type, bytes, signal })
      this.assertCurrent(path, generation, signal)
      await this.mutateIfCurrent(path, generation, signal, 'chunking-status', () =>
        this.writeStatus(path, watchedRoot, 'chunking')
      )
      const chunks = chunkText(extracted)
      if (chunks.length === 0) {
        outcome = 'skipped'
        await this.mutateIfCurrent(path, generation, signal, 'replacement', () =>
          this.chunks.replaceDocument(
            {
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
            },
            []
          )
        )
        return
      }

      await this.mutateIfCurrent(path, generation, signal, 'embedding-status', () =>
        this.writeStatus(path, watchedRoot, 'embedding')
      )
      const embeddings = await measureOperation(this.metrics, 'file-embedding', () =>
        embedInBatches(
          this.embeddingProvider,
          chunks.map((chunk) => chunk.content),
          signal
        )
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
      await this.mutateIfCurrent(path, generation, signal, 'replacement', () =>
        this.chunks.replaceDocument(
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
      )
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        outcome = 'cancelled'
        return
      }
      outcome = 'failure'
      if ((error as { transient?: boolean }).transient) {
        if (this.queue.isCurrent(path, generation)) this.enqueue(path, watchedRoot, force)
        return
      }
      if (this.queue.isCurrent(path, generation)) {
        await this.mutateIfCurrent(path, generation, signal, 'error-status', () =>
          this.writeStatus(path, watchedRoot, 'error', 'Indexing failed.')
        ).catch(() => undefined)
      }
    } finally {
      this.metrics?.record('file-ingestion', performance.now() - startedAt, outcome)
    }
  }
}
