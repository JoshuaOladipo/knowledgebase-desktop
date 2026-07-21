import { access, realpath, stat } from 'node:fs/promises'
import { basename, normalize, resolve } from 'node:path'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import type { FileEntry, FileEvent, WatcherState } from '../shared/contracts'

export type FileEventListener = (event: FileEvent) => void
export type WatcherStateListener = (state: WatcherState) => void

/** Validates folder input, resolves canonical paths, and removes duplicates. */
export async function validateFolders(folders: string[]): Promise<string[]> {
  if (!Array.isArray(folders) || folders.length === 0) {
    throw new Error('Choose at least one folder to watch.')
  }

  const validated = await Promise.all(
    folders.map(async (folder) => {
      if (typeof folder !== 'string' || folder.trim().length === 0) {
        throw new Error('Folder paths must be non-empty strings.')
      }

      const absolutePath = normalize(resolve(folder))
      await access(absolutePath)
      const details = await stat(absolutePath)
      if (!details.isDirectory()) throw new Error(`${absolutePath} is not a directory.`)
      return realpath(absolutePath)
    })
  )

  return [...new Set(validated)]
}

/** Reads path metadata and converts it to the serializable renderer contract. */
export async function toFileEntry(path: string): Promise<FileEntry> {
  const details = await stat(path)
  return {
    path,
    name: basename(path),
    size: details.size,
    createdAt: details.birthtime.toISOString(),
    modifiedAt: details.mtime.toISOString(),
    isDirectory: details.isDirectory()
  }
}

export class WatcherService {
  private watcher: FSWatcher | null = null
  private state: WatcherState = { folders: [], phase: 'idle' }
  private readonly files = new Map<string, FileEntry>()
  private generation = 0

  /** Creates a service that reports file and lifecycle events to its owner. */
  constructor(
    private readonly onFileEvent: FileEventListener,
    private readonly onStateChange: WatcherStateListener
  ) {}

  /** Returns an immutable snapshot of the current watcher state. */
  getState(): WatcherState {
    return { ...this.state, folders: [...this.state.folders] }
  }

  /** Returns the latest known files so newly opened renderers can hydrate their table. */
  getFiles(): FileEntry[] {
    return [...this.files.values()]
  }

  /** Starts validated folders, reusing an identical active watcher. */
  async start(folders: string[]): Promise<WatcherState> {
    const validatedFolders = await validateFolders(folders)
    if (
      this.watcher &&
      validatedFolders.length === this.state.folders.length &&
      validatedFolders.every((folder, index) => folder === this.state.folders[index])
    ) {
      return this.getState()
    }

    await this.closeWatcher()
    this.files.clear()
    const generation = ++this.generation
    this.updateState({ folders: validatedFolders, phase: 'loading' })
    const watcher = chokidar.watch(validatedFolders, {
      persistent: true,
      ignoreInitial: false,
      depth: 99
    })
    this.watcher = watcher

    watcher
      .on('add', (path) => void this.emitEntry('add', path, generation))
      .on('addDir', (path) => void this.emitEntry('add', path, generation))
      .on('change', (path) => void this.emitEntry('change', path, generation))
      .on('unlink', (path) => this.emitRemoval(path, generation))
      .on('unlinkDir', (path) => this.emitRemoval(path, generation))
      .on('ready', () => {
        if (generation === this.generation) {
          this.updateState({ folders: validatedFolders, phase: 'watching' })
        }
      })
      .on('error', (error) => {
        if (generation === this.generation) {
          this.updateState({ folders: validatedFolders, phase: 'error', error: String(error) })
        }
      })

    return this.getState()
  }

  /** Closes the active watcher and returns the service to its idle state. */
  async stop(): Promise<WatcherState> {
    ++this.generation
    await this.closeWatcher()
    this.files.clear()
    this.updateState({ folders: [], phase: 'idle' })
    return this.getState()
  }

  /** Detaches and closes the underlying Chokidar watcher when present. */
  private async closeWatcher(): Promise<void> {
    const watcher = this.watcher
    this.watcher = null
    if (watcher) await watcher.close()
  }

  /** Converts an add or change notification into a metadata-rich event. */
  private async emitEntry(type: 'add' | 'change', path: string, generation: number): Promise<void> {
    try {
      const entry = await toFileEntry(path)
      if (generation === this.generation) {
        this.files.set(path, entry)
        this.onFileEvent({ type, path, entry })
      }
    } catch (error) {
      if (generation === this.generation) {
        this.updateState({ ...this.state, phase: 'error', error: String(error) })
      }
    }
  }

  /** Emits a removal belonging to the currently active watcher generation. */
  private emitRemoval(path: string, generation: number): void {
    if (generation === this.generation) {
      this.files.delete(path)
      this.onFileEvent({ type: 'unlink', path })
    }
  }

  /** Stores and broadcasts a watcher lifecycle state change. */
  private updateState(state: WatcherState): void {
    this.state = state
    this.onStateChange(this.getState())
  }
}
