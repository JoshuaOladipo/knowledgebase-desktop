import type { IndexDocumentPhase, IndexStatus } from '../../shared/contracts'

export const activeIndexPhases = new Set<IndexDocumentPhase>([
  'queued',
  'extracting',
  'chunking',
  'embedding'
])

export function indexIsWorking(status: IndexStatus | undefined): boolean {
  return Boolean(
    status?.activeWorkers ||
    status?.pendingJobs ||
    status?.documents.some((document) => activeIndexPhases.has(document.status))
  )
}

export function indexPhaseBadge(status: IndexDocumentPhase): string {
  if (status === 'indexed') return 'badge-success'
  if (status === 'error') return 'badge-error'
  if (status === 'skipped') return 'badge-warning'
  return 'badge-info'
}
