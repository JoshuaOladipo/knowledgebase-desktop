# Feature: Retrieval, grounded generation, and chat

Status: Planning

## Feature intent

Extend the implemented local indexing foundation with semantic retrieval, evidence-bounded answer
generation, structured citations, conversation persistence, typed IPC, and an accessible chat UI.

## Feature acceptance criteria

- [ ] Retrieve compatible indexed chunks using exact Turso cosine distance and validated filters.
- [ ] Bound, deduplicate, and diversify evidence within a configured context budget.
- [ ] Return insufficient context rather than force an unsupported answer.
- [ ] Generate answers through a provider-neutral interface using delimited untrusted evidence.
- [ ] Return and persist structured citations derived from actual retrieved chunks.
- [ ] Expose validated index/chat operations through preload without privileged primitives.
- [ ] Support cancellation and deterministic tests without network or paid providers.
- [ ] Render indexing state, conversations, answers, and citations accessibly.
- [ ] Benchmark retrieval at 10K, 50K, and 100K chunks before choosing a scaling change.

## Architecture assessment

- Affected components: `ai`, `database`, `electron-main`, `preload`, `shared-contracts`, `renderer`
- Protected decision required: Conditional
- ADR: ADR-002 covers the intended existing boundary. A cloud provider, new datastore, separate service,
  synchronization system, or authentication architecture requires a new approved ADR before adoption.

## Tasks

### RAG-001 — Implement exact vector retrieval

Status: Pending

Purpose:
Retrieve source chunks compatible with the active embedding provider and optional managed-root/document
filters.

Dependencies:

- Approved or accepted ADR-001 and ADR-002 direction.
- Existing vectors written by `src/main/database/chunkRepository.ts:31-107`.

Acceptance criteria:

- [ ] Add a retriever interface and Turso implementation using `vector_distance_cos`.
- [ ] Validate embedding provider, model, and dimensions before comparing vectors.
- [ ] Support bounded candidate count and validated root/document filters.
- [ ] Return chunk/document identity, content, metadata, rank, and distance.
- [ ] Add deterministic retrieval tests using a temporary database.

Expected verification:

- Targeted retrieval and database tests, then the complete quality suite.

Architecture impact:

- Adds retrieval within the existing main-process `ai`/`database` boundary.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-002 — Select evidence and enforce relevance

Status: Pending

Purpose:
Convert raw nearest-neighbor candidates into non-duplicative, relevant evidence within a token budget.

Dependencies:

- RAG-001

Acceptance criteria:

- [ ] Remove duplicates and heavily overlapping adjacent chunks.
- [ ] Enforce candidate, final-result, distance, and context-budget limits.
- [ ] Produce a typed insufficient-context result.
- [ ] Preserve stable source identifiers for prompt and citation mapping.

Expected verification:

- Unit tests for overlap, thresholds, deterministic ordering, and budget boundaries.

Architecture impact:

- None beyond the planned `ai` component responsibility.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-003 — Implement grounded generation orchestration

Status: Pending

Purpose:
Generate an answer from selected evidence while preventing retrieved instructions from gaining
application authority.

Dependencies:

- RAG-002
- Product choice and approval for the first generation provider.

Acceptance criteria:

- [ ] Define a cancellable provider-neutral `GenerationProvider`.
- [ ] Delimit evidence and require supplied source identifiers in the prompt.
- [ ] Do not invoke generation when evidence is insufficient.
- [ ] Map citations from retrieval records rather than trusting model markup.
- [ ] Classify provider errors without logging prompts, source text, answers, or credentials.

Expected verification:

- Deterministic service tests with fake embedding, retrieval, and generation providers.

Architecture impact:

- A cloud provider is a protected external dependency and requires approval plus security disclosure.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-004 — Persist conversations and evidence

Status: Pending

Purpose:
Retain conversations and the exact evidence used by each generated answer.

Dependencies:

- RAG-003

Acceptance criteria:

- [ ] Add versioned migrations and repositories for conversations and messages.
- [ ] Preserve evidence snapshots or immutable source records so citations remain reproducible after
      re-indexing.
- [ ] Define deletion and retention behavior.
- [ ] Preserve atomicity between a persisted answer and its citations.

Expected verification:

- Temporary-database migration, persistence, restart, deletion, and rollback tests.

Architecture impact:

- Extends the approved/proposed Turso schema; database ownership remains unchanged.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-005 — Add typed index and chat IPC

Status: Pending

Purpose:
Expose task-level indexing and chat capabilities without exposing database, filesystem, or provider
primitives.

Dependencies:

- RAG-001 through RAG-004 contracts.

Acceptance criteria:

- [ ] Define serializable index, question, answer, citation, conversation, and error contracts.
- [ ] Add validated operations for status, re-index, ask, cancel, read, and delete.
- [ ] Reject unknown fields, invalid identifiers/limits, and unmanaged paths.
- [ ] Add preload/main IPC integration tests.

Expected verification:

- Preload and IPC tests plus type checking.

Architecture impact:

- Extends the existing preload boundary without bypassing it.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-006 — Build indexing and chat UI

Status: Pending

Purpose:
Present index progress, failures, conversations, grounded answers, and structured sources.

Dependencies:

- RAG-005

Acceptance criteria:

- [ ] Show global and per-document indexing states and retry/re-index actions.
- [ ] Add accessible question submission, cancellation, loading, empty, and failure states.
- [ ] Display structured source excerpts and metadata separately from answer markup.
- [ ] Reveal a cited file only through a validated main-process operation.
- [ ] Add renderer tests for state transitions, cancellation, insufficient context, and citations.

Expected verification:

- Renderer tests, type checking, lint, and production build.

Architecture impact:

- Renderer remains presentation-only.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAG-007 — Benchmark and release-verify retrieval

Status: Pending

Purpose:
Measure whether exact vector search is adequate and verify packaged RAG behavior.

Dependencies:

- RAG-001 through RAG-006
- IDX-002

Acceptance criteria:

- [ ] Record retrieval latency and memory at 10K, 50K, and 100K chunks.
- [ ] Record indexing/provider latency and database size without user content.
- [ ] Verify restart, offline behavior, cancellation, and citations in packaged applications.
- [ ] Create a separate approved design before adding approximate indexing, sync, or a new service.

Expected verification:

- Benchmark report and supported-platform package checks.

Architecture impact:

- Measurements do not alter architecture; follow-on scaling changes may be protected.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

## Decisions / blockers

- The first generation provider is not selected.
- Conversation retention and database encryption policies are unresolved.
- Retrieval quality thresholds require representative evaluation data.
- Cloud providers, synchronization, new services, and new datastores require protected-decision
  approval.

## Handoff

- Authorized: Planning/documentation only; no RAG feature implementation authorized by this request.
- Implemented: Durable indexing foundation only.
- Verified: No implementation verification claimed in this task record.
- Remaining: RAG-001 through RAG-007.
- Risks/blockers: Provider choice, architecture approval, exact-search scaling, native packaging.
- Next action: Obtain ADR direction and generation-provider decision, then authorize RAG-001.
