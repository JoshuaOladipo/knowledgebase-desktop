// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DiagnosticsSnapshot,
  FileEntry,
  FileEvent,
  IndexDocumentPhase,
  IndexStatus,
  LocalGenerationSettings,
  PcAgentApi,
  WatcherState
} from '../../shared/contracts'
import App from './App'

const file: FileEntry = {
  path: '/watched/Report.txt',
  name: 'Report.txt',
  size: 2_048,
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-02T00:00:00.000Z',
  isDirectory: false
}

const idleWatcher: WatcherState = { folders: [], phase: 'idle' }
const settings: LocalGenerationSettings = {
  enabled: false,
  endpoint: 'http://127.0.0.1:1234/v1',
  model: 'local-model',
  requestTimeoutMs: 30_000,
  maximumOutputTokens: 512,
  temperature: 0.2
}
const diagnostics: DiagnosticsSnapshot = {
  retention: 'memory-until-cleared-or-restart',
  telemetryEnabled: false,
  operations: []
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
const indexStatus: IndexStatus = {
  documents: [],
  documentsTotal: 0,
  documentsTruncated: false,
  counts: Object.fromEntries(phases.map((phase) => [phase, 0])) as Record<
    IndexDocumentPhase,
    number
  >,
  pendingJobs: 0,
  activeWorkers: 0,
  maintenanceError: null,
  chunkCount: 0,
  databaseBytes: 0,
  diagnostics
}

interface ApiHarness {
  api: PcAgentApi
  emitFile(event: FileEvent): void
}

function createApi(overrides: Partial<PcAgentApi> = {}): ApiHarness {
  let fileListener: ((event: FileEvent) => void) | undefined
  const api: PcAgentApi = {
    selectFolders: vi.fn().mockResolvedValue([]),
    startWatching: vi.fn().mockResolvedValue(idleWatcher),
    stopWatching: vi.fn().mockResolvedValue(idleWatcher),
    getWatcherState: vi.fn().mockResolvedValue(idleWatcher),
    getWatchedFiles: vi.fn().mockResolvedValue([]),
    onFileEvent: vi.fn((listener) => {
      fileListener = listener
      return () => {
        if (fileListener === listener) fileListener = undefined
      }
    }),
    onWatcherState: vi.fn(() => () => undefined),
    getLocalGenerationSettings: vi.fn().mockResolvedValue(settings),
    updateLocalGenerationSettings: vi.fn().mockResolvedValue(settings),
    askQuestion: vi.fn(),
    cancelQuestion: vi.fn().mockResolvedValue(undefined),
    listConversations: vi.fn().mockResolvedValue([]),
    readConversation: vi.fn().mockResolvedValue(null),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    getIndexStatus: vi.fn().mockResolvedValue(indexStatus),
    reindexAll: vi.fn().mockResolvedValue(undefined),
    retryDocument: vi.fn().mockResolvedValue(undefined),
    revealCitation: vi.fn().mockResolvedValue(undefined),
    clearDiagnostics: vi.fn().mockResolvedValue(diagnostics),
    exportDiagnostics: vi.fn().mockResolvedValue(false),
    ...overrides
  }
  return {
    api,
    emitFile(event) {
      if (!fileListener) throw new Error('File listener is not registered.')
      fileListener(event)
    }
  }
}

function installApi(overrides: Partial<PcAgentApi> = {}): ApiHarness {
  const harness = createApi(overrides)
  window.pcAgent = harness.api
  return harness
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('App workspace', () => {
  it('reports rejected hydration calls without producing an unhandled rejection', async () => {
    installApi({
      getWatcherState: vi.fn().mockRejectedValue(new Error('state unavailable')),
      getWatchedFiles: vi.fn().mockRejectedValue(new Error('snapshot unavailable'))
    })

    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load watched files: Error: snapshot unavailable'
    )
    expect(screen.getByText('Choose a folder to begin.')).toBeTruthy()
  })

  it('restores the current file snapshot and reports an error when stop fails', async () => {
    const watcher: WatcherState = { folders: ['/watched'], phase: 'watching' }
    installApi({
      getWatcherState: vi.fn().mockResolvedValue(watcher),
      getWatchedFiles: vi.fn().mockResolvedValue([file]),
      stopWatching: vi.fn().mockRejectedValue(new Error('stop failed'))
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(file.name)

    await user.click(screen.getByRole('button', { name: 'Stop watching' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Error: stop failed')
    expect(screen.getByText(file.name)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Stop watching' }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('clears the prior snapshot when replacing the watched folders', async () => {
    const watcher: WatcherState = { folders: ['/watched'], phase: 'watching' }
    const replacement: WatcherState = {
      folders: ['/watched', '/another-folder'],
      phase: 'loading'
    }
    installApi({
      getWatcherState: vi.fn().mockResolvedValue(watcher),
      getWatchedFiles: vi.fn().mockResolvedValue([file]),
      selectFolders: vi.fn().mockResolvedValue(['/another-folder']),
      startWatching: vi.fn().mockResolvedValue(replacement)
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(file.name)

    await user.click(screen.getByRole('button', { name: 'Add folder' }))

    await waitFor(() => expect(screen.queryByText(file.name)).toBeNull())
    expect(screen.getByText('/another-folder')).toBeTruthy()
    expect(screen.getByText('Loading files')).toBeTruthy()
  })

  it('keeps file interactions consistent across live updates and both views', async () => {
    const watcher: WatcherState = { folders: ['/watched'], phase: 'watching' }
    const harness = installApi({
      getWatcherState: vi.fn().mockResolvedValue(watcher),
      getWatchedFiles: vi.fn().mockResolvedValue([file])
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(file.name)

    await user.click(screen.getByRole('checkbox', { name: 'Select all visible files' }))
    expect(
      (screen.getByRole('checkbox', { name: `Select ${file.name}` }) as HTMLInputElement).checked
    ).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('dialog').textContent).toContain(file.path)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Card view' }))
    expect(screen.getByRole('button', { name: 'Card view' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(screen.getByText((content) => content.includes('2.0 KB ·'))).toBeTruthy()

    const changed = { ...file, size: 4_096, modifiedAt: '2026-01-03T00:00:00.000Z' }
    act(() => harness.emitFile({ type: 'change', path: file.path, entry: changed }))
    expect(await screen.findByText((content) => content.includes('4.0 KB ·'))).toBeTruthy()

    await user.type(screen.getByRole('searchbox'), 'missing')
    expect(screen.getByText('No files match your search.')).toBeTruthy()
    await user.clear(screen.getByRole('searchbox'))

    act(() => harness.emitFile({ type: 'unlink', path: file.path }))
    await waitFor(() => expect(screen.queryByText(file.name)).toBeNull())
    expect(screen.getByText('This folder is empty.')).toBeTruthy()
  })
})
