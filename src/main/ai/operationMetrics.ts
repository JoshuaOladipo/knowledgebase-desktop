export type OperationOutcome = 'success' | 'failure' | 'cancelled' | 'skipped'

export interface OperationMetricRecorder {
  record(operation: string, durationMs: number, outcome: OperationOutcome): void
}

export async function measureOperation<T>(
  recorder: OperationMetricRecorder | undefined,
  operation: string,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now()
  try {
    const result = await action()
    recorder?.record(operation, performance.now() - startedAt, 'success')
    return result
  } catch (error) {
    const cancelled =
      error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failure'
    recorder?.record(operation, performance.now() - startedAt, cancelled)
    throw error
  }
}
