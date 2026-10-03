# Feature: RAG security, reliability, format expansion, and future evolution

Status: Planning

## Feature intent

Capture the RAG work that follows or cuts across retrieval/chat: provider configuration, privacy,
diagnostics, recovery, additional formats, end-to-end verification, and explicitly deferred evolution.

## Feature acceptance criteria

- [ ] Cloud provider credentials and disclosure follow the documented privacy boundary.
- [ ] RAG settings are validated and safely bounded.
- [ ] Recovery and end-to-end behavior are tested across interruption and restart.
- [ ] Diagnostics provide operational value without collecting user content.
- [ ] Additional formats and retrieval enhancements are adopted only after evaluation.

## Architecture assessment

- Affected components: `electron-main`, `ingestion`, `ai`, `database`, `preload`, `renderer`
- Protected decision required: Conditional for cloud providers, Turso Sync, another datastore,
  approximate-index service, authentication, or changed data ownership.
- ADR: New ADR required before any protected option is selected.

## Tasks

### RAGX-001 — Evaluate additional document formats

Status: Pending

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

Status: Pending

Purpose:
Allow future model configuration without leaking credentials or silently moving local content to cloud
services.

Dependencies:

- Selection and approval of any cloud provider.

Acceptance criteria:

- [ ] Store provider secrets through operating-system credential storage.
- [ ] Never store credentials in `settings.json`, Turso, renderer state, IPC payloads, or logs.
- [ ] Show a clear local-versus-cloud disclosure before a cloud provider is enabled.
- [ ] Safely bound model, batch size, retrieval counts, distance threshold, context budget, file-size
      limit, and enabled-format settings.
- [ ] Detect configuration changes that require controlled re-indexing.
- [ ] Define credential removal, provider disablement, and error recovery behavior.

Expected verification:

- Configuration validation, secret-store adapter, disclosure UI, and IPC tests using fake providers.

Architecture impact:

- A cloud provider is a protected external dependency and requires approval.

Implementation:

- Only the local hash embedding configuration is implemented.

Tests:

- Pending.

Verification:

- Not run.

Commit:

- Not available.

### RAGX-003 — Add privacy-safe diagnostics and optional telemetry

Status: Pending

Purpose:
Expose indexing and retrieval health without logging or transmitting user content.

Dependencies:

- Defined local diagnostics and telemetry opt-in policy.

Acceptance criteria:

- [ ] Record document/chunk counts, queue depth, stage, durations, categorized failures, provider
      latency, retrieval latency, and database size.
- [ ] Exclude source text, embeddings, parser raw data, prompts, answers, filenames when unnecessary,
      and credentials by default.
- [ ] Keep telemetry disabled unless explicitly opted in.
- [ ] Document retention, export, deletion, and redaction behavior.

Expected verification:

- Redaction tests and opt-in/opt-out behavior tests.

Architecture impact:

- Any remote telemetry endpoint is a protected external dependency.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGX-004 — Add interruption and recovery coverage

Status: Pending

Purpose:
Prove that failures cannot commit partial or stale document state.

Dependencies:

- Stable indexing and RAG orchestration contracts.

Acceptance criteria:

- [ ] Test interruption during extraction, embedding, document replacement, migration, and shutdown.
- [ ] Test restart reconciliation after files change while the application is closed.
- [ ] Test cancellation from deletion, folder removal, reconfiguration, newer generations, and quit.
- [ ] Verify previous valid chunks survive failed replacement.
- [ ] Verify shutdown drains or aborts provider work and closes Turso cleanly.

Expected verification:

- Main-process unit/integration tests with temporary files and databases.

Architecture impact:

- None; verifies existing boundaries.

Implementation:

- Graceful shutdown and generation checks exist, but complete recovery coverage does not.

Tests:

- Partial queue/database coverage exists; required scenarios remain incomplete.

Verification:

- Not run.

Commit:

- Not available.

### RAGX-005 — Add complete end-to-end RAG verification

Status: Pending

Purpose:
Verify the user journey from folder selection through grounded answer citations.

Dependencies:

- `tasks/active/rag-retrieval-and-chat.md`
- RAGX-004

Acceptance criteria:

- [ ] Cover folder selection, initial index, file change/deletion, and restart persistence.
- [ ] Cover retrieval, insufficient context, generation, citations, and conversation persistence.
- [ ] Cover cancellation, offline mode, provider authentication failure, and transient provider error.
- [ ] Run against fake/local providers without network or paid services in CI.
- [ ] Add supported-platform packaged smoke coverage where feasible.

Expected verification:

- End-to-end suite plus supported-platform package checks.

Architecture impact:

- None unless the test harness introduces a service or external dependency.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

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

- Cloud provider, encryption, telemetry, and synchronization choices require product/security input.
- Retrieval enhancements require representative benchmarks rather than assumptions.

## Handoff

- Authorized: Documentation migration only.
- Implemented: Durable task coverage for previously untransitioned RAG work.
- Verified: No application behavior verification claimed.
- Remaining: RAGX-001 through RAGX-007.
- Risks/blockers: Privacy decisions, credential storage, representative evaluation data, packaging.
- Next action: Complete core retrieval/chat before authorizing deferred enhancements.
