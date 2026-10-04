import { useCallback, useEffect, useState } from 'react'
import type { IndexStatus } from '../../../shared/contracts'
import { formatBytes } from '../fileState'
import { activeIndexPhases, indexIsWorking, indexPhaseBadge } from '../indexPresentation'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Displays live aggregate/per-document indexing state and privacy-safe diagnostics. */
export default function IndexStatusPanel(): React.JSX.Element {
  const [status, setStatus] = useState<IndexStatus>()
  const [error, setError] = useState<string>()
  const [actionPending, setActionPending] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setStatus(await window.pcAgent.getIndexStatus())
      setError(undefined)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = (): void => {
      void window.pcAgent
        .getIndexStatus()
        .then((next) => {
          if (active) {
            setStatus(next)
            setError(undefined)
          }
        })
        .catch((cause) => {
          if (active) setError(errorMessage(cause))
        })
    }
    load()
    const interval = window.setInterval(load, 1_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  async function run(action: () => Promise<unknown>): Promise<void> {
    setActionPending(true)
    setError(undefined)
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setActionPending(false)
    }
  }

  const working = indexIsWorking(status)

  return (
    <section className="rounded-box bg-base-100 p-4 shadow-sm" aria-labelledby="index-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="index-heading" className="font-semibold">
            Knowledge index
          </h2>
          <p className="text-sm text-base-content/60" aria-live="polite">
            {status
              ? `${status.counts.indexed} indexed · ${status.chunkCount} chunks · ${status.pendingJobs} queued · ${status.activeWorkers} active`
              : 'Loading index status…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {working && <span className="loading loading-spinner loading-sm" aria-label="Indexing" />}
          <button
            className="btn btn-outline btn-sm"
            type="button"
            disabled={actionPending}
            onClick={() => void run(() => window.pcAgent.reindexAll())}
          >
            Re-index all
          </button>
        </div>
      </div>

      {status && status.documents.length > 0 && (
        <div className="mt-4 max-h-72 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>Chunks</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {status.documents.map((document) => (
                <tr key={document.id}>
                  <td className="max-w-md">
                    <div className="truncate font-medium" title={document.path}>
                      {document.name}
                    </div>
                    {document.error && <div className="text-xs text-error">{document.error}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-sm ${indexPhaseBadge(document.status)}`}>
                      {document.status}
                    </span>
                  </td>
                  <td>{document.chunkCount}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs"
                      type="button"
                      disabled={actionPending || activeIndexPhases.has(document.status)}
                      onClick={() => void run(() => window.pcAgent.retryDocument(document.id))}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status && (
        <details className="collapse-arrow collapse mt-3 border border-base-300">
          <summary className="collapse-title text-sm font-medium">Privacy-safe diagnostics</summary>
          <div className="collapse-content text-sm">
            <p className="text-base-content/60">
              Stored in memory until cleared or restart. Telemetry is disabled. Database size:{' '}
              {formatBytes(status.databaseBytes)}.
            </p>
            {status.diagnostics.operations.length === 0 ? (
              <p className="mt-2 text-base-content/50">No operation timings recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {status.diagnostics.operations.map((operation) => (
                  <li className="flex flex-wrap justify-between gap-2" key={operation.operation}>
                    <span>{operation.operation}</span>
                    <span className="font-mono text-xs">
                      {operation.count} runs · {operation.failureCount} failed ·{' '}
                      {operation.cancellationCount} cancelled · {operation.skippedCount} skipped ·
                      avg {(operation.totalDurationMs / operation.count).toFixed(1)} ms · max{' '}
                      {operation.maximumDurationMs.toFixed(1)} ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="btn btn-ghost btn-xs"
                type="button"
                disabled={actionPending}
                onClick={() => void run(() => window.pcAgent.clearDiagnostics())}
              >
                Clear
              </button>
              <button
                className="btn btn-outline btn-xs"
                type="button"
                disabled={actionPending}
                onClick={() => void run(() => window.pcAgent.exportDiagnostics())}
              >
                Export JSON
              </button>
            </div>
          </div>
        </details>
      )}

      {error && (
        <p className="alert alert-error mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
