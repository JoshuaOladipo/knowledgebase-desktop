import { readFile, rename, writeFile } from 'node:fs/promises'
import type { LocalGenerationSettings } from '../shared/contracts'
import { validateLocalGenerationSettings } from './ai/providers/localServerGenerationProvider'

interface ApplicationSettingsFile {
  watchedFolders?: unknown
  localGeneration?: unknown
}

const pendingWrites = new Map<string, Promise<void>>()

export const defaultLocalGenerationSettings: LocalGenerationSettings = {
  enabled: false,
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'local-model',
  requestTimeoutMs: 120_000,
  maximumOutputTokens: 1_024,
  temperature: 0.1
}

async function loadSettingsFile(path: string): Promise<ApplicationSettingsFile> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as unknown
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as ApplicationSettingsFile)
      : {}
  } catch {
    return {}
  }
}

async function saveSettingsFile(path: string, settings: ApplicationSettingsFile): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, JSON.stringify(settings, null, 2), 'utf8')
  await rename(temporaryPath, path)
}

async function updateSettingsFile(
  path: string,
  update: (settings: ApplicationSettingsFile) => ApplicationSettingsFile
): Promise<void> {
  const previous = pendingWrites.get(path) ?? Promise.resolve()
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      await saveSettingsFile(path, update(await loadSettingsFile(path)))
    })
  pendingWrites.set(path, pending)
  try {
    await pending
  } finally {
    if (pendingWrites.get(path) === pending) pendingWrites.delete(path)
  }
}

/** Loads only bounded non-empty folder strings from the main-process settings file. */
export async function loadWatchedFolders(path: string): Promise<string[]> {
  const settings = await loadSettingsFile(path)
  if (!Array.isArray(settings.watchedFolders) || settings.watchedFolders.length > 100) return []
  return settings.watchedFolders.filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0 && value.length <= 4096
  )
}

/** Persists the validated active folder list owned by the main process. */
export async function saveWatchedFolders(path: string, folders: string[]): Promise<void> {
  await updateSettingsFile(path, (settings) => ({ ...settings, watchedFolders: folders }))
}

export async function loadLocalGenerationSettings(path: string): Promise<LocalGenerationSettings> {
  const settings = await loadSettingsFile(path)
  try {
    return validateLocalGenerationSettings(settings.localGeneration)
  } catch {
    return defaultLocalGenerationSettings
  }
}

export async function saveLocalGenerationSettings(
  path: string,
  settings: LocalGenerationSettings
): Promise<LocalGenerationSettings> {
  const validated = validateLocalGenerationSettings(settings)
  await updateSettingsFile(path, (current) => ({ ...current, localGeneration: validated }))
  return validated
}
