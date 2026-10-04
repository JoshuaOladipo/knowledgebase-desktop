// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IndexStatus, PcAgentApi } from '../../../shared/contracts'
import IndexStatusPanel from './IndexStatusPanel'

const status: IndexStatus = {
  documents: [],
  documentsTotal: 0,
  documentsTruncated: false,
  counts: {
    queued: 0,
    extracting: 0,
    chunking: 0,
    embedding: 0,
    indexed: 0,
    skipped: 0,
    error: 0
  },
  pendingJobs: 0,
  activeWorkers: 0,
  maintenanceError: 'Index maintenance failed.',
  chunkCount: 0,
  databaseBytes: 0,
  diagnostics: {
    retention: 'memory-until-cleared-or-restart',
    telemetryEnabled: false,
    operations: []
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('IndexStatusPanel polling', () => {
  it('waits for the current status request before scheduling another poll', async () => {
    vi.useFakeTimers()
    let resolveFirst!: (value: IndexStatus) => void
    const first = new Promise<IndexStatus>((resolve) => {
      resolveFirst = resolve
    })
    const getIndexStatus = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(status)
    window.pcAgent = {
      getIndexStatus,
      reindexAll: vi.fn(),
      retryDocument: vi.fn(),
      clearDiagnostics: vi.fn(),
      exportDiagnostics: vi.fn()
    } as unknown as PcAgentApi

    render(<IndexStatusPanel />)
    expect(getIndexStatus).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(5_000))
    expect(getIndexStatus).toHaveBeenCalledTimes(1)

    await act(async () => resolveFirst(status))
    expect(screen.getByRole('alert').textContent).toContain('Index maintenance failed.')
    await act(async () => vi.advanceTimersByTime(999))
    expect(getIndexStatus).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(1))
    expect(getIndexStatus).toHaveBeenCalledTimes(2)
  })
})
