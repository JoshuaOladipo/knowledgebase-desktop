import type { Database } from '@tursodatabase/database'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { lstat, realpath } from 'node:fs/promises'
import type { DiagnosticsSnapshot, IndexDocumentPhase, IndexStatus } from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'
import { DocumentRepository } from './database/documentRepository'
import type { LocalDiagnostics } from './diagnostics'
import type { IngestionCoordinator } from './ingestion/ingestionCoordinator'
import { pathIsInside } from './ingestion/ingestionCoordinator'
import { assertTrustedSender } from './ipc'
import type { WatcherService } from './watcher'

export interface IndexIpcDependencies {
  database: Database
  ingestion: IngestionCoordinator
  watcher: WatcherService
  diagnostics: LocalDiagnostics
  trustedRendererUrl: string
  revealFile: (canonicalPath: string) => void
  exportDiagnostics: (snapshot: DiagnosticsSnapshot) => Promise<boolean>
  documentLimit?: number
}

export const INDEX_STATUS_DOCUMENT_LIMIT = 200

function validateString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must be a non-empty string of at most ${maximum} characters.`)
  }
  return value
}

async function databaseSize(database: Database): Promise<number> {
  const pageCount = (await database.get('PRAGMA page_count')) as Record<string, unknown> | undefined
  const pageSize = (await database.get('PRAGMA page_size')) as Record<string, unknown> | undefined
  return Number(pageCount?.page_count ?? 0) * Number(pageSize?.page_size ?? 0)
}

const phases: IndexDocumentPhase[] = [
  'queued',
  'extracting',
  'chunking',
  'embedding',
  'indexed',
  'skipped',
  'error'
]

/** Registers bounded index control, citation reveal, and local diagnostic IPC operations. */
export function registerIndexIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  dependencies: IndexIpcDependencies
): void {
  const documents = new DocumentRepository(dependencies.database)
  const trusted = (event: IpcMainInvokeEvent): void =>
    assertTrustedSender(event, dependencies.trustedRendererUrl)

  ipc.handle(ipcChannels.getIndexStatus, async (event, ...args): Promise<IndexStatus> => {
    trusted(event)
    if (args.length !== 0) throw new Error('Index status does not accept arguments.')
    const documentLimit = dependencies.documentLimit ?? INDEX_STATUS_DOCUMENT_LIMIT
    const [records, statusCounts, chunkCount, size] = await Promise.all([
      documents.listWithChunkCounts(documentLimit),
      documents.countByStatus(),
      documents.countChunks(),
      databaseSize(dependencies.database)
    ])
    const counts = Object.fromEntries(phases.map((phase) => [phase, 0])) as Record<
      IndexDocumentPhase,
      number
    >
    for (const record of statusCounts) {
      if (phases.includes(record.status)) counts[record.status] = record.count
    }
    const documentsTotal = Object.values(counts).reduce((total, count) => total + count, 0)
    return {
      documents: records.map((record) => ({
        id: record.id,
        path: record.path,
        name: record.name,
        status: record.status,
        error: record.error,
        chunkCount: record.chunkCount,
        updatedAt: record.updatedAt
      })),
      documentsTotal,
      documentsTruncated: documentsTotal > records.length,
      counts,
      ...dependencies.ingestion.getQueueState(),
      chunkCount,
      databaseBytes: size,
      diagnostics: dependencies.diagnostics.snapshot()
    }
  })

  ipc.handle(ipcChannels.reindexAll, (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Re-index all does not accept arguments.')
    dependencies.ingestion.reindexAll(dependencies.watcher.getFiles())
  })

  ipc.handle(ipcChannels.retryDocument, async (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Document retry requires one ID.')
    const document = await documents.getById(validateString(args[0], 'Document ID', 200))
    if (!document) throw new Error('Document does not exist.')
    dependencies.ingestion.retry(document.path)
  })

  ipc.handle(ipcChannels.revealCitation, async (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Citation reveal requires one document path.')
    const path = validateString(args[0], 'Document path', 4_096)
    const document = await documents.getByPath(path)
    if (!document || document.status !== 'indexed') {
      throw new Error('Citation is not a currently indexed document.')
    }
    const matchingRoot = dependencies.watcher
      .getState()
      .folders.find((root) => pathIsInside(root, path))
    if (!matchingRoot) throw new Error('Citation is outside the active watched roots.')
    const details = await lstat(path)
    if (!details.isFile() || details.isSymbolicLink())
      throw new Error('Citation is not a regular file.')
    const [canonicalPath, canonicalRoot] = await Promise.all([
      realpath(path),
      realpath(matchingRoot)
    ])
    if (!pathIsInside(canonicalRoot, canonicalPath)) {
      throw new Error('Citation resolves outside the active watched root.')
    }
    dependencies.revealFile(canonicalPath)
  })

  ipc.handle(ipcChannels.clearDiagnostics, (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Diagnostics clear does not accept arguments.')
    return dependencies.diagnostics.clear()
  })

  ipc.handle(ipcChannels.exportDiagnostics, async (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Diagnostics export does not accept arguments.')
    return dependencies.exportDiagnostics(dependencies.diagnostics.snapshot())
  })
}
