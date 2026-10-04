# Feature: Immediate defect remediation

Status: Verified

## Feature intent

Resolve the immediate correctness, scalability, observability, and documentation defects identified
by the 2026-10-04 codebase evaluation without changing the approved component boundaries.

## Authorization

The user explicitly authorized fixing the immediate defects on 2026-10-04.

## Architecture assessment

- Affected components: `electron-main`, `watcher`, `ingestion`, `database`, `shared-contracts`,
  `renderer`, documentation
- Protected decision required: No
- ADR: None

## Tasks

### IMD-001 — Preserve the durable index during application shutdown

Status: Verified

Acceptance criteria:

- [x] Closing the application stops native watching without treating shutdown as removal of all
      configured roots.
- [x] Explicit user stop-watching behavior continues to remove inactive-root index records.
- [x] Shutdown drains ingestion and closes Turso even when an earlier close step fails.
- [x] A composed watcher/ingestion/database regression test proves indexed records and chunks survive
      shutdown and database reopen.

### IMD-002 — Bound index-status snapshots and serialize polling

Status: Verified

Acceptance criteria:

- [x] Aggregate counts continue to cover the complete index.
- [x] Per-document status returned over IPC has a fixed upper bound and reports truncation.
- [x] Renderer polling never has more than one status request in flight.
- [x] Repository, IPC, and renderer behavior have deterministic tests.

### IMD-003 — Surface background ingestion mutation failures

Status: Verified

Acceptance criteria:

- [x] Fire-and-forget status and cleanup mutations report sanitized failures through an explicit
      coordinator error boundary.
- [x] Expected cancellation does not produce a failure report.
- [x] Tests cover background mutation failure reporting.

### IMD-004 — Reconcile stale implementation documentation

Status: Verified

Acceptance criteria:

- [x] Canonical architecture status accurately distinguishes implemented index controls, UI, and
      benchmarks from remaining work.
- [x] Release handoff no longer describes retrieval and chat as unfinished.
- [x] Documentation reflects bounded status snapshots and the shutdown preservation invariant.

### IMD-005 — Verify the final remediation state

Status: Verified

Acceptance criteria:

- [x] Prettier, lint, both TypeScript targets, all tests, and production build pass.
- [x] A fresh Linux x64 unpacked package and packaged Turso/OfficeParser smoke test pass.
- [x] Actual implementation paths, tests, verification results, and remaining risks are recorded.

## Implementation record

- `WatcherService.shutdown` in `src/main/watcher.ts:131-136` closes native watching without publishing
  empty logical roots. `shutdownApplicationServices` in `src/main/shutdown.ts:15-33` closes watcher,
  ingestion, and database in order while attempting every step. `src/main/index.ts:213-228` uses that
  orchestration for Electron's `before-quit` lifecycle.
- `IngestionCoordinator` in `src/main/ingestion/ingestionCoordinator.ts:76-92,119-149,230-243` tracks
  background mutations, exposes a sanitized maintenance failure, and clears it only for explicit
  retry/re-index recovery.
- `DocumentRepository` in `src/main/database/documentRepository.ts:40-64` bounds document detail rows
  and computes complete per-status counts. `src/main/indexIpc.ts:24-93` applies the 200-row production
  cap and returns total/truncation state through `IndexStatus` at `src/shared/contracts.ts:109-120`.
- `IndexStatusPanel` in `src/renderer/src/components/IndexStatusPanel.tsx:15-58,101-108` coalesces all
  status reads behind one in-flight promise and displays truncation; the same component displays
  sanitized maintenance failures.
- `docs/rag-architecture.md` and the affected active task records now reflect implemented index
  controls, bounded serial polling, shutdown preservation, and packaged RAG status.

## Tests and verification

- `src/main/shutdown.test.ts:27-99` composes a real watcher, ingestion coordinator, and file-backed
  database, proves the index survives shutdown/reopen, and verifies later close steps still run after
  an earlier failure.
- `src/main/ingestion/ingestion.test.ts:603-676` verifies sanitized maintenance failure reporting,
  explicit recovery, and cancellation handling.
- `src/main/database/database.test.ts`, `src/main/indexIpc.test.ts:28-121`, and
  `src/renderer/src/components/IndexStatusPanel.test.tsx:39-69` verify bounded rows, complete counts,
  truncation, and serialized polling.
- Repository-wide Prettier, lint, both TypeScript targets, 100 tests across 24 files, and the production
  build passed on 2026-10-04.
- A fresh Linux x64 unpacked package and its packaged Turso/OfficeParser smoke test passed on
  2026-10-04.

## Handoff

- Authorized: IMD-001 through IMD-005.
- Implemented: All authorized scope.
- Verified: All acceptance criteria and required local/package checks passed.
- Remaining: No authorized remediation scope remains.
- Risks/blockers: Cross-platform installed-package verification remains outside this remediation.
- Commit: Not available.
