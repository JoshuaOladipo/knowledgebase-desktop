import { describe, expect, it } from 'vitest'
import type { IndexStatus } from '../../shared/contracts'
import { indexIsWorking, indexPhaseBadge } from './indexPresentation'

function status(phase: IndexStatus['documents'][number]['status']): IndexStatus {
  return {
    documents: [
      {
        id: 'one',
        path: '/managed/note.txt',
        name: 'note.txt',
        status: phase,
        error: null,
        chunkCount: 0,
        updatedAt: '2026-10-04T00:00:00.000Z'
      }
    ],
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
    chunkCount: 0,
    databaseBytes: 0,
    diagnostics: {
      retention: 'memory-until-cleared-or-restart',
      telemetryEnabled: false,
      operations: []
    }
  }
}

describe('index presentation state', () => {
  it('distinguishes active stages from terminal stages and queue activity', () => {
    expect(indexIsWorking(status('embedding'))).toBe(true)
    expect(indexIsWorking(status('indexed'))).toBe(false)
    expect(indexIsWorking({ ...status('indexed'), pendingJobs: 1 })).toBe(true)
  })

  it('maps success, failure, skipped, and active states to distinct badges', () => {
    expect(indexPhaseBadge('indexed')).toBe('badge-success')
    expect(indexPhaseBadge('error')).toBe('badge-error')
    expect(indexPhaseBadge('skipped')).toBe('badge-warning')
    expect(indexPhaseBadge('embedding')).toBe('badge-info')
  })
})
