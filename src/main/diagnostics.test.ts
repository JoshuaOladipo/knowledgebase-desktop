import { describe, expect, it, vi } from 'vitest'
import { LocalDiagnostics } from './diagnostics'
import { measureOperation } from './ai/operationMetrics'

describe('privacy-safe local diagnostics', () => {
  it('aggregates bounded operation names without payload data and clears explicitly', () => {
    const diagnostics = new LocalDiagnostics()
    diagnostics.record('file-embedding', 12.345, 'success')
    diagnostics.record('file-embedding', 7, 'failure')
    diagnostics.record('/private/document.txt', 99, 'success')

    expect(diagnostics.snapshot()).toMatchObject({
      retention: 'memory-until-cleared-or-restart',
      telemetryEnabled: false,
      operations: [
        {
          operation: 'file-embedding',
          count: 2,
          failureCount: 1,
          totalDurationMs: 19.35,
          maximumDurationMs: 12.35
        }
      ]
    })
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain('document.txt')
    expect(diagnostics.clear().operations).toEqual([])
  })

  it('measures success and failure without retaining action results or errors', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(15)
    const diagnostics = new LocalDiagnostics()
    await expect(
      measureOperation(diagnostics, 'vector-retrieval', async () => 'sensitive result')
    ).resolves.toBe('sensitive result')
    expect(diagnostics.snapshot().operations[0]).toMatchObject({
      operation: 'vector-retrieval',
      count: 1,
      totalDurationMs: 5
    })
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain('sensitive')
  })
})
