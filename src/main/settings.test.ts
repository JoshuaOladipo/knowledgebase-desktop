import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultLocalGenerationSettings,
  loadLocalGenerationSettings,
  loadWatchedFolders,
  saveLocalGenerationSettings,
  saveWatchedFolders
} from './settings'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

describe('main-process settings', () => {
  it('persists and restores watched folders', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-settings-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'settings.json')
    await saveWatchedFolders(path, ['/one', '/two'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ watchedFolders: ['/one', '/two'] })
    await expect(loadWatchedFolders(path)).resolves.toEqual(['/one', '/two'])
  })

  it('falls back safely for missing, malformed, and invalid saved settings', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-settings-invalid-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'settings.json')
    await expect(loadWatchedFolders(path)).resolves.toEqual([])
    await writeFile(path, '{invalid')
    await expect(loadWatchedFolders(path)).resolves.toEqual([])
    await writeFile(path, JSON.stringify({ watchedFolders: ['/valid', '', 42] }))
    await expect(loadWatchedFolders(path)).resolves.toEqual(['/valid'])
  })

  it('persists local generation settings without discarding watched folders', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-settings-generation-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'settings.json')
    await saveWatchedFolders(path, ['/documents'])
    const generation = {
      ...defaultLocalGenerationSettings,
      enabled: true,
      endpoint: 'http://localhost:1234/v1',
      model: 'test-model'
    }
    await expect(saveLocalGenerationSettings(path, generation)).resolves.toEqual(generation)
    await expect(loadLocalGenerationSettings(path)).resolves.toEqual(generation)
    await expect(loadWatchedFolders(path)).resolves.toEqual(['/documents'])
    await saveWatchedFolders(path, ['/updated'])
    await expect(loadLocalGenerationSettings(path)).resolves.toEqual(generation)
  })

  it('uses disabled safe defaults for malformed generation settings', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-settings-generation-invalid-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'settings.json')
    await writeFile(
      path,
      JSON.stringify({
        localGeneration: { ...defaultLocalGenerationSettings, endpoint: 'https://remote.example' }
      })
    )
    await expect(loadLocalGenerationSettings(path)).resolves.toEqual(defaultLocalGenerationSettings)
  })
})
