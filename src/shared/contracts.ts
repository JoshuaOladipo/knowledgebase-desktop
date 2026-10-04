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

export interface LocalGenerationSettings {
  enabled: boolean
  endpoint: string
  model: string
  requestTimeoutMs: number
  maximumOutputTokens: number
  temperature: number
}

export interface ChatCitation {
  sourceId: string
  documentPath: string
  documentName: string
  heading: string | null
  sourceLabel: string | null
  excerpt: string
}

export type ChatAnswer =
  | { kind: 'insufficient-context'; reason: string }
  | { kind: 'answer'; text: string; citations: ChatCitation[] }

export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations: ChatCitation[]
  createdAt: string
}

export interface ConversationDetails extends ConversationSummary {
  messages: ChatMessage[]
}

export interface AskQuestionRequest {
  requestId: string
  conversationId?: string
  question: string
}

export interface AskQuestionResult {
  conversationId?: string
  answer: ChatAnswer
}

export type IndexDocumentPhase =
  'queued' | 'extracting' | 'chunking' | 'embedding' | 'indexed' | 'skipped' | 'error'

export interface IndexDocumentState {
  id: string
  path: string
  name: string
  status: IndexDocumentPhase
  error: string | null
  chunkCount: number
  updatedAt: string
}

export interface DiagnosticOperationSummary {
  operation: string
  count: number
  successCount: number
  failureCount: number
  cancellationCount: number
  skippedCount: number
  totalDurationMs: number
  maximumDurationMs: number
  lastRecordedAt: string
}

export interface DiagnosticsSnapshot {
  retention: 'memory-until-cleared-or-restart'
  telemetryEnabled: false
  operations: DiagnosticOperationSummary[]
}

export interface IndexStatus {
  documents: IndexDocumentState[]
  counts: Record<IndexDocumentPhase, number>
  pendingJobs: number
  activeWorkers: number
  chunkCount: number
  databaseBytes: number
  diagnostics: DiagnosticsSnapshot
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
  /** Returns the user-managed local generation server configuration. */
  getLocalGenerationSettings(): Promise<LocalGenerationSettings>
  /** Validates and persists the local generation server configuration. */
  updateLocalGenerationSettings(settings: LocalGenerationSettings): Promise<LocalGenerationSettings>
  /** Retrieves local evidence and asks the configured local server to answer. */
  askQuestion(request: AskQuestionRequest): Promise<AskQuestionResult>
  /** Cancels an in-flight question owned by this renderer. */
  cancelQuestion(requestId: string): Promise<void>
  /** Lists retained local conversations, most recently updated first. */
  listConversations(): Promise<ConversationSummary[]>
  /** Loads one conversation and its citation snapshots. */
  readConversation(id: string): Promise<ConversationDetails | null>
  /** Permanently deletes one local conversation. */
  deleteConversation(id: string): Promise<void>
  /** Returns aggregate queue, document, storage, and privacy-safe diagnostic state. */
  getIndexStatus(): Promise<IndexStatus>
  /** Re-indexes every visible file under the active watched roots. */
  reindexAll(): Promise<void>
  /** Retries one managed document by its opaque database identifier. */
  retryDocument(id: string): Promise<void>
  /** Reveals a currently indexed managed citation in the system file manager. */
  revealCitation(documentPath: string): Promise<void>
  /** Clears in-memory privacy-safe diagnostic aggregates. */
  clearDiagnostics(): Promise<DiagnosticsSnapshot>
  /** Exports a redacted diagnostic snapshot through a native save dialog. */
  exportDiagnostics(): Promise<boolean>
}

export const ipcChannels = {
  selectFolders: 'folders:select',
  startWatching: 'watcher:start',
  stopWatching: 'watcher:stop',
  getWatcherState: 'watcher:state:get',
  getWatchedFiles: 'watcher:files:get',
  fileEvent: 'watcher:file-event',
  watcherState: 'watcher:state',
  getLocalGenerationSettings: 'generation:settings:get',
  updateLocalGenerationSettings: 'generation:settings:update',
  askQuestion: 'chat:ask',
  cancelQuestion: 'chat:cancel',
  listConversations: 'chat:conversations:list',
  readConversation: 'chat:conversation:read',
  deleteConversation: 'chat:conversation:delete',
  getIndexStatus: 'index:status:get',
  reindexAll: 'index:reindex-all',
  retryDocument: 'index:document:retry',
  revealCitation: 'index:citation:reveal',
  clearDiagnostics: 'diagnostics:clear',
  exportDiagnostics: 'diagnostics:export'
} as const
