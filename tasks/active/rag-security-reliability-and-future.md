# Feature: RAG security, reliability, format expansion, and future evolution

Status: Partially implemented — product decisions and end-to-end delivery remain

## Feature intent

Capture the RAG work that follows or cuts across retrieval/chat: provider configuration, privacy,
diagnostics, recovery, additional formats, end-to-end verification, and explicitly deferred evolution.

## Feature acceptance criteria

- [ ] Cloud provider credentials and disclosure follow the documented privacy boundary.
- [x] Local generation settings are validated and safely bounded.
- [x] Recovery and end-to-end behavior are tested across interruption and restart.
- [x] Local diagnostics provide operational value without collecting user content.
- [ ] Additional formats and retrieval enhancements are adopted only after evaluation.

## Architecture assessment

- Affected components: `electron-main`, `ingestion`, `ai`, `database`, `preload`, `renderer`
- Protected decision required: Conditional for cloud providers, Turso Sync, another datastore,
  approximate-index service, authentication, or changed data ownership.
- ADR: New ADR required before any protected option is selected.

## Tasks

### RAGX-001 — Evaluate additional document formats

Status: Blocked pending representative documents and retrieval evaluation criteria

Purpose:
Determine whether HTML, CSV, JSON, and source-code extraction improve the intended knowledge base.

Dependencies:

- Representative user documents and retrieval evaluation criteria.

Acceptance criteria:

- [ ] Evaluate HTML, CSV, JSON, and source code separately for structure and citation metadata.
- [ ] Define allowlisted extensions, MIME mappings, size/complexity limits, and parser threat models.
- [ ] Select formats only with deterministic local fixtures and malformed/adversarial cases.
- [ ] Add encrypted, empty, oversized, malformed, and resource-limit fixtures for every enabled
      extractor, including currently enabled formats.

Expected verification:

- Extractor unit/integration tests with no network, OCR download, or paid service.

Architecture impact:

- New parser dependencies require an approved ADR.

Implementation:

- PDF and DOCX support already exists through OfficeParser; HTML/CSV/JSON/source-code evaluation does
  not.

Tests:

- Pending.

Verification:

- Not run.

Commit:

- Not available.

### RAGX-002 — Implement secure provider configuration and disclosure

Status: Partially implemented — credential-free remote provider complete; authenticated support deferred

Purpose:
Allow future model configuration without leaking credentials or silently moving local content to cloud
services.

Dependencies:

- ADR-005 for the selected user-managed local or remote provider.
- Selection, approval, and credential storage before adding an authenticated provider.

Acceptance criteria:

- [ ] Store provider secrets through operating-system credential storage.
- [x] Never store credentials in `settings.json`, Turso, renderer state, IPC payloads, or logs.
- [x] Disclose when the configured provider can receive questions and evidence remotely.
- [x] Safely bound model, timeout, output, endpoint, retrieval, context, and file-size
      limit, and enabled-format settings.
- [ ] Detect configuration changes that require controlled re-indexing.
- [x] Define provider disablement and sanitized error recovery behavior for the credential-free
      provider.

Expected verification:

- Configuration validation, secret-store adapter, disclosure UI, and IPC tests using fake providers.

Architecture impact:

- Credential-free remote HTTP(S) generation is approved by ADR-005. Authenticated providers still
  require a separate protected decision and secure credential storage.

Implementation:

- Generation settings are validated and atomically persisted by the main process; the legacy settings
  key is migrated without losing configuration.
- The adapter accepts user-configured HTTP(S) endpoints while rejecting URL credentials, queries,
  fragments, redirects, oversized/malformed responses, and unbounded time/output settings.
- `ChatPanel` discloses remote question/evidence transfer, warns for unencrypted remote HTTP, and does
  not accept secrets.

Tests:

- Provider, settings, IPC, cancellation, and deterministic fake-generation tests run without network.

Verification:

- Included in the 66-test suite; typecheck, lint, and production build pass.

Commit:

- Not available.

### RAGX-003 — Add privacy-safe diagnostics and optional telemetry

Status: Verified — local-only diagnostics; remote telemetry deliberately unavailable

Purpose:
Expose indexing and retrieval health without logging or transmitting user content.

Dependencies:

- Local-only policy: aggregate diagnostics remain in memory; no remote telemetry endpoint or opt-in
  surface exists.

Acceptance criteria:

- [x] Record document/chunk counts, queue depth, stage, durations, categorized failures, provider
      latency, retrieval latency, and database size.
- [x] Exclude source text, embeddings, parser raw data, prompts, answers, filenames when unnecessary,
      and credentials by default.
- [x] Keep telemetry disabled unless explicitly opted in.
- [x] Document retention, export, deletion, and redaction behavior.

Expected verification:

- Redaction tests and opt-in/opt-out behavior tests.

Architecture impact:

- Any remote telemetry endpoint is a protected external dependency.

Implementation:

- `LocalDiagnostics` retains aggregate operation counts, categorized outcomes, total/max durations,
  and timestamps in memory until clear or restart; invalid operation labels are discarded.
- Ingestion records content-free total and file-embedding timings. Grounded answering records
  question embedding, vector retrieval, and answer-generation timings.
- `IndexStatus` includes document/chunk counts, queue depth, stages, database bytes, and diagnostic
  aggregates. The renderer can clear them or export redacted JSON through a native save dialog.
- Telemetry is hard-disabled and no remote destination, identifier, content field, or transmission
  code exists.

Tests:

- `diagnostics.test.ts` verifies aggregation, clearing, invalid-label rejection, and that action
  results/errors are not retained.
- `indexIpc.test.ts` verifies local snapshot, clear/export, sender checks, and managed reveal controls.

Verification:

- Included in the 100-test suite; typecheck and lint pass.

Commit:

- Not available.

### RAGX-004 — Add interruption and recovery coverage

Status: Verified locally

Purpose:
Prove that failures cannot commit partial or stale document state.

Dependencies:

- Stable indexing and RAG orchestration contracts.
- IDX-004 and IDX-005 from `tasks/active/indexing-release-verification.md`.

Acceptance criteria:

- [x] Test interruption during extraction, embedding, document replacement, migration, and shutdown.
- [x] Test restart reconciliation after files change while the application is closed.
- [x] Test cancellation from deletion, folder removal, reconfiguration, newer generations, and quit.
- [x] Test a successful empty/non-indexable replacement clears prior chunks and cannot later be marked
      indexed through the unchanged-content fast path.
- [x] Test stale generations cannot commit after a newer change, deletion, or active-root removal.
- [x] Test reconciliation waits for a complete watcher snapshot before deleting durable records.
- [x] Verify previous valid chunks survive failed replacement.
- [x] Verify shutdown drains or aborts provider work and closes Turso cleanly.

Expected verification:

- Main-process unit/integration tests with temporary files and databases.

Architecture impact:

- None; verifies existing boundaries.

Implementation:

- Generation and active-root freshness, deletion, status writes, replacement, and reconciliation share
  the serialized mutation boundary. Empty/non-indexable replacements clear chunks atomically.
- Process shutdown closes native watching without publishing empty active roots, then drains ingestion
  before closing Turso, so normal quit preserves the durable index.

Tests:

- Ingestion tests cover deletion and active-root removal during delayed embedding, zero-chunk
  replacement, root cleanup, newer-change supersession, offline restart reconciliation, and shutdown
  drain. Queue/database tests cover cancellation, close/drain, replacement rollback, and migration
  rollback. Watcher tests prove the initial metadata snapshot is complete before the watching state
  triggers reconciliation.
- `src/main/shutdown.test.ts` composes a real watcher, ingestion coordinator, and file-backed database,
  then verifies indexed documents and chunks survive shutdown and database reopen.

Verification:

- The complete 100-test suite, typecheck, lint, and production build passed on 2026-10-04.

Commit:

- Not available.

### RAGX-005 — Add complete end-to-end RAG verification

Status: Verified locally — packaged cross-platform smoke remains

Purpose:
Verify the user journey from folder selection through grounded answer citations.

Dependencies:

- `tasks/active/rag-retrieval-and-chat.md`
- RAGX-004

Acceptance criteria:

- [x] Cover folder selection, initial index, file change/deletion, and restart persistence.
- [x] Cover retrieval, insufficient context, generation, citations, and conversation persistence.
- [x] Cover cancellation, offline mode, provider authentication failure, and transient provider error.
- [x] Run against fake/local providers without network or paid services in CI.
- [ ] Add supported-platform packaged smoke coverage where feasible.

Expected verification:

- End-to-end suite plus supported-platform package checks.

Architecture impact:

- None unless the test harness introduces a service or external dependency.

Implementation:

- The local integration path uses the real ingestion coordinator, embedded Turso database, exact
  retriever, local hash embeddings, grounded answer service, and conversation repository with a
  deterministic in-process generation provider.

Tests:

- `src/main/ragE2e.test.ts` covers initial ingestion, database restart, scoped retrieval, grounded
  citations, retained conversation evidence, re-indexing changed content, and deletion.
- Watcher/settings tests cover folder restoration; chat/provider tests cover disabled/offline mode,
  cancellation, authentication, transient failures, and privacy-safe error classification.

Verification:

- The local RAG integration and focused error suites pass without network or paid services.

Commit:

- Not available.

### RAGX-006 — Resolve database encryption at rest

Status: Pending decision

Purpose:
Decide whether the local Turso knowledge base requires encryption and define a recoverable key model.

Dependencies:

- Product privacy requirements and supported OS credential storage.

Acceptance criteria:

- [ ] Decide whether encryption is required by default, optional, or excluded.
- [ ] Define key generation, OS storage, recovery, rotation, corruption, and device migration behavior.
- [ ] Document consequences of a lost key.
- [ ] Add migration and recovery tests before enabling encryption for existing users.

Expected verification:

- Security review and encrypted-database lifecycle tests if approved.

Architecture impact:

- Protected security/data-ownership decision; requires an ADR.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Pending decision.

Commit:

- Not available.

### RAGX-007 — Evaluate retrieval and delivery enhancements

Status: Deferred

Purpose:
Evaluate improvements only after exact retrieval and non-streaming generation have measurable baselines.

Dependencies:

- RAG-007 benchmarks from `tasks/active/rag-retrieval-and-chat.md`.

Acceptance criteria:

- [ ] Evaluate hybrid lexical/vector retrieval after exact-search quality and latency are measured.
- [ ] Evaluate reranking for ambiguous or large candidate sets.
- [ ] Evaluate fully local embedding and generation models for offline-only operation.
- [ ] Evaluate Turso Sync only as explicit opt-in backup/cross-device behavior.
- [ ] Add streaming IPC only after cancellation, ordering, cleanup, and non-streaming behavior are
      reliable.
- [ ] Adopt approximate vector indexing only when stable in the selected Turso deployment and justified
      by benchmarks.

Expected verification:

- Evaluation reports with representative quality, latency, privacy, packaging, and cost results.

Architecture impact:

- Sync, new providers, services, and datastores are protected decisions requiring ADRs.

Implementation:

- Not implemented.

Tests:

- Not applicable until an option is selected.

Verification:

- Deferred.

Commit:

- Not available.

## Decisions / blockers

- Cloud provider, encryption, remote telemetry, and synchronization choices require product/security
  input.
- IDX-004 and IDX-005 have verified canonical containment and deterministic commit interleavings;
  platform verification remains.
- Retrieval enhancements require representative benchmarks rather than assumptions.

## Handoff

- Authorized: The request covers pending implementation, but not separate protected product and
  architecture decisions.
- Implemented: Snapshot containment, generation-safe mutations, deterministic advertised-format
  fixtures, interruption races, retrieval/evidence/orchestration foundations, conversation evidence
  persistence, and Linux x64 packaged native/parser smoke verification.
- Verified: The 100-test local quality suite, typecheck, lint, production build, project validation,
  and prior Linux x64 packaged smoke passed.
- Remaining: Additional-format evaluation, encrypted fixtures, cloud-provider and telemetry decisions,
  packaged end-to-end chat, encryption policy, and deferred enhancements.
- Risks/blockers: Representative evaluation data, cloud/privacy/encryption decisions, and
  cross-platform runners.
- Next action: Supply the format-evaluation corpus and encryption decisions, then run packaged chat
  verification on clean platform runners.
