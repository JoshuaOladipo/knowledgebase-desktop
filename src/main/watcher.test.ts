import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WatcherState } from '../shared/contracts'
import { toFileEntry, validateFolders, WatcherService } from './watcher'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true })))
})

/** Creates and tracks an isolated directory for watcher tests. */
async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'pc-agent-'))
  temporaryFolders.push(folder)
  return folder
}

describe('watcher utilities', () => {
  it('validates, normalizes, and deduplicates folder paths', async () => {
    const folder = await temporaryFolder()
    await expect(validateFolders([folder, folder])).resolves.toEqual([folder])
    await expect(validateFolders([])).rejects.toThrow('at least one folder')
    const file = join(folder, 'not-a-folder.txt')
    await writeFile(file, 'content')
    await expect(validateFolders([file])).rejects.toThrow('not a directory')
    await expect(validateFolders([join(folder, 'missing')])).rejects.toThrow()
  })

  it('converts file-system metadata to a serializable entry', async () => {
    const folder = await temporaryFolder()
    const path = join(folder, 'document.txt')
    await writeFile(path, 'hello')
    const entry = await toFileEntry(path)
    expect(entry).toMatchObject({ path, name: 'document.txt', size: 5, isDirectory: false })
    expect(() => new Date(entry.modifiedAt)).not.toThrow()
  })

  it('starts once for identical folders and closes cleanly', async () => {
    const folder = await temporaryFolder()
    const path = join(folder, 'restored.txt')
    await writeFile(path, 'restored content')
    const states: WatcherState[] = []
    let ready: (() => void) | undefined
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve
    })
    let fileAdded: (() => void) | undefined
    const fileAddedPromise = new Promise<void>((resolve) => {
      fileAdded = resolve
    })
    const service = new WatcherService(
      (event) => {
        if (event.path === path) fileAdded?.()
      },
      (state) => {
        states.push(state)
        if (state.phase === 'watching') ready?.()
      }
    )

    await service.start([folder])
    await readyPromise
    await fileAddedPromise
    expect(service.getFiles()).toContainEqual(
      expect.objectContaining({ path, name: 'restored.txt' })
    )
    expect((await service.start([folder])).phase).toBe('watching')
    expect((await service.stop()).phase).toBe('idle')
    expect(service.getFiles()).toEqual([])
    expect(states.map((state) => state.phase)).toContain('loading')
  })

  it('does not traverse directory symlinks outside a watched root', async () => {
    const folder = await temporaryFolder()
    const outside = await temporaryFolder()
    const external = join(outside, 'external.txt')
    await writeFile(external, 'must stay outside')
    await symlink(outside, join(folder, 'linked'))
    const paths: string[] = []
    let ready: (() => void) | undefined
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve
    })
    const service = new WatcherService(
      (event) => paths.push(event.path),
      (state) => {
        if (state.phase === 'watching') ready?.()
      }
    )
    await service.start([folder])
    await readyPromise
    expect(paths).not.toContain(join(folder, 'linked', 'external.txt'))
    await service.stop()
  })

  it('publishes a complete initial snapshot before the watching state', async () => {
    const folder = await temporaryFolder()
    await writeFile(join(folder, 'first.txt'), 'first')
    await writeFile(join(folder, 'second.txt'), 'second')
    let snapshotAtReady: string[] = []
    let ready!: () => void
    const readyPromise = new Promise<void>((resolve) => {
      ready = resolve
    })
    const service = new WatcherService(
      () => undefined,
      (state) => {
        if (state.phase === 'watching') {
          snapshotAtReady = service
            .getFiles()
            .filter(({ isDirectory }) => !isDirectory)
            .map(({ name }) => name)
          ready()
        }
      }
    )
    await service.start([folder])
    await readyPromise
    expect(snapshotAtReady.sort()).toEqual(['first.txt', 'second.txt'])
    await service.stop()
  })
})
