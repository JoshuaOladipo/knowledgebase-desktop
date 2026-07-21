export interface FileEntry {
  path: string
  name: string
  size: number
  modifiedAt: string
  createdAt: string
  isDirectory: boolean
}

export type FileEventType = 'add' | 'change' | 'unlink'

export interface FileEvent {
  type: FileEventType
  path: string
  entry?: FileEntry
}

export type WatcherPhase = 'idle' | 'loading' | 'watching' | 'error'

export interface WatcherState {
  folders: string[]
  phase: WatcherPhase
  error?: string
}

export interface PcAgentApi {
  /** Opens the native directory picker and returns the chosen folder paths. */
  selectFolders(): Promise<string[]>
  /** Starts or replaces the active watcher with the supplied folders. */
  startWatching(folders: string[]): Promise<WatcherState>
  /** Closes the active watcher and clears its configured folders. */
  stopWatching(): Promise<WatcherState>
  /** Returns a snapshot of the current watcher configuration and phase. */
  getWatcherState(): Promise<WatcherState>
  /** Returns the latest file snapshot maintained by the active watcher. */
  getWatchedFiles(): Promise<FileEntry[]>
  /** Subscribes to file-system changes and returns an unsubscribe function. */
  onFileEvent(listener: (event: FileEvent) => void): () => void
  /** Subscribes to watcher lifecycle changes and returns an unsubscribe function. */
  onWatcherState(listener: (state: WatcherState) => void): () => void
}

export const ipcChannels = {
  selectFolders: 'folders:select',
  startWatching: 'watcher:start',
  stopWatching: 'watcher:stop',
  getWatcherState: 'watcher:state:get',
  getWatchedFiles: 'watcher:files:get',
  fileEvent: 'watcher:file-event',
  watcherState: 'watcher:state'
} as const
