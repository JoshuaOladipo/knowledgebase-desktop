export interface IngestionJob {
  path: string
  watchedRoot: string
  force?: boolean
}

interface PendingJob {
  job: IngestionJob
  generation: number
}

export type IngestionWorker = (
  job: IngestionJob,
  generation: number,
  signal: AbortSignal
) => Promise<void>

/** A bounded latest-job-wins queue keyed by canonical file path. */
export class IngestionQueue {
  private readonly pending = new Map<string, PendingJob>()
  private readonly running = new Map<string, AbortController>()
  private readonly generations = new Map<string, number>()
  private readonly idleResolvers = new Set<() => void>()
  private activeWorkers = 0
  private closed = false

  constructor(
    private readonly worker: IngestionWorker,
    private readonly concurrency = 2
  ) {
    if (concurrency < 1) throw new Error('Ingestion concurrency must be positive.')
  }

  enqueue(job: IngestionJob): number {
    if (this.closed) throw new Error('The ingestion queue is closed.')
    const generation = (this.generations.get(job.path) ?? 0) + 1
    this.generations.set(job.path, generation)
    this.pending.set(job.path, { job, generation })
    this.running.get(job.path)?.abort()
    this.pump()
    return generation
  }

  cancel(path: string): void {
    this.generations.set(path, (this.generations.get(path) ?? 0) + 1)
    this.pending.delete(path)
    this.running.get(path)?.abort()
    this.resolveIdleIfNeeded()
  }

  cancelOutsideRoots(roots: string[], contains: (root: string, path: string) => boolean): void {
    for (const path of new Set([...this.pending.keys(), ...this.running.keys()])) {
      if (!roots.some((root) => contains(root, path))) this.cancel(path)
    }
  }

  isCurrent(path: string, generation: number): boolean {
    return this.generations.get(path) === generation
  }

  getState(): { pendingJobs: number; activeWorkers: number } {
    return { pendingJobs: this.pending.size, activeWorkers: this.activeWorkers }
  }

  async onIdle(): Promise<void> {
    if (this.activeWorkers === 0 && this.pending.size === 0) return
    await new Promise<void>((resolve) => this.idleResolvers.add(resolve))
  }

  async close(): Promise<void> {
    this.closed = true
    this.pending.clear()
    for (const controller of this.running.values()) controller.abort()
    await this.onIdle()
  }

  private pump(): void {
    while (!this.closed && this.activeWorkers < this.concurrency && this.pending.size > 0) {
      const first = this.pending.entries().next().value as [string, PendingJob] | undefined
      if (!first) break
      const [path, pending] = first
      this.pending.delete(path)
      const controller = new AbortController()
      this.running.set(path, controller)
      this.activeWorkers += 1
      void this.worker(pending.job, pending.generation, controller.signal)
        .catch(() => undefined)
        .finally(() => {
          if (this.running.get(path) === controller) this.running.delete(path)
          this.activeWorkers -= 1
          this.pump()
          this.resolveIdleIfNeeded()
        })
    }
  }

  private resolveIdleIfNeeded(): void {
    if (this.activeWorkers !== 0 || this.pending.size !== 0) return
    for (const resolve of this.idleResolvers) resolve()
    this.idleResolvers.clear()
  }
}
