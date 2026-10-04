import { readFile, rename, writeFile } from 'node:fs/promises'
import type { GenerationServerSettings } from '../shared/contracts'
import { validateGenerationServerSettings } from './ai/providers/openAiCompatibleGenerationProvider'

interface ApplicationSettingsFile {
  watchedFolders?: unknown
  generationServer?: unknown
  /** Legacy key retained only for a one-way settings migration. */
  localGeneration?: unknown
}

const pendingWrites = new Map<string, Promise<void>>()

export const defaultGenerationServerSettings: GenerationServerSettings = {
  enabled: false,
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'model',
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

export async function loadGenerationServerSettings(
  path: string
): Promise<GenerationServerSettings> {
  const settings = await loadSettingsFile(path)
  let validated: GenerationServerSettings
  try {
    validated = validateGenerationServerSettings(
      settings.generationServer ?? settings.localGeneration
    )
  } catch {
    return defaultGenerationServerSettings
  }
  if (settings.generationServer === undefined && settings.localGeneration !== undefined) {
    await updateSettingsFile(path, (current) => {
      if (current.generationServer !== undefined) return current
      const migrated = { ...current, generationServer: validated }
      delete migrated.localGeneration
      return migrated
    })
  }
  return validated
}

export async function saveGenerationServerSettings(
  path: string,
  settings: GenerationServerSettings
): Promise<GenerationServerSettings> {
  const validated = validateGenerationServerSettings(settings)
  await updateSettingsFile(path, (current) => {
    const migrated = { ...current, generationServer: validated }
    delete migrated.localGeneration
    return migrated
  })
  return validated
}
