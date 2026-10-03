import { describe, expect, it } from 'vitest'
import { IngestionQueue } from './ingestionQueue'

describe('ingestion queue', () => {
  it('deduplicates pending paths and runs only the latest generation', async () => {
    const processed: string[] = []
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const queue = new IngestionQueue(async (job, generation) => {
      if (job.path === '/first') await firstBlocked
      processed.push(`${job.path}:${generation}:${job.force ? 'force' : 'normal'}`)
    }, 1)

    queue.enqueue({ path: '/first', watchedRoot: '/' })
    queue.enqueue({ path: '/second', watchedRoot: '/' })
    queue.enqueue({ path: '/second', watchedRoot: '/', force: true })
    releaseFirst()
    await queue.onIdle()

    expect(processed).toEqual(['/first:1:normal', '/second:2:force'])
    await queue.close()
  })

  it('cancels running and pending work during shutdown', async () => {
    let aborted = false
    const queue = new IngestionQueue(async (_job, _generation, signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true
            resolve()
          },
          { once: true }
        )
      })
    })
    queue.enqueue({ path: '/running', watchedRoot: '/' })
    await queue.close()
    expect(aborted).toBe(true)
  })
})
