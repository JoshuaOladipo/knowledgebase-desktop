import type { DiagnosticOperationSummary, DiagnosticsSnapshot } from '../shared/contracts'
import type { OperationMetricRecorder, OperationOutcome } from './ai/operationMetrics'

/** Stores content-free operational aggregates in memory; it never performs telemetry. */
export class LocalDiagnostics implements OperationMetricRecorder {
  private readonly operations = new Map<string, DiagnosticOperationSummary>()

  record(operation: string, durationMs: number, outcome: OperationOutcome): void {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(operation) || !Number.isFinite(durationMs)) return
    const duration = Math.max(0, Math.round(durationMs * 100) / 100)
    const current = this.operations.get(operation)
    const next: DiagnosticOperationSummary = {
      operation,
      count: (current?.count ?? 0) + 1,
      successCount: (current?.successCount ?? 0) + (outcome === 'success' ? 1 : 0),
      failureCount: (current?.failureCount ?? 0) + (outcome === 'failure' ? 1 : 0),
      cancellationCount: (current?.cancellationCount ?? 0) + (outcome === 'cancelled' ? 1 : 0),
      skippedCount: (current?.skippedCount ?? 0) + (outcome === 'skipped' ? 1 : 0),
      totalDurationMs: Math.round(((current?.totalDurationMs ?? 0) + duration) * 100) / 100,
      maximumDurationMs: Math.max(current?.maximumDurationMs ?? 0, duration),
      lastRecordedAt: new Date().toISOString()
    }
    this.operations.set(operation, next)
  }

  snapshot(): DiagnosticsSnapshot {
    return {
      retention: 'memory-until-cleared-or-restart',
      telemetryEnabled: false,
      operations: [...this.operations.values()].sort((left, right) =>
        left.operation.localeCompare(right.operation)
      )
    }
  }

  clear(): DiagnosticsSnapshot {
    this.operations.clear()
    return this.snapshot()
  }
}
