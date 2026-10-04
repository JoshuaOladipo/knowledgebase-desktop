# Feature: Retrieval, grounded generation, and chat

Status: Partially verified — local implementation and benchmarks complete; packaged verification remains

## Feature intent

Extend the implemented local indexing foundation with semantic retrieval, evidence-bounded answer
generation, structured citations, conversation persistence, typed IPC, and an accessible chat UI.

## Feature acceptance criteria

- [x] Retrieve compatible indexed chunks using exact Turso cosine distance and validated filters.
- [x] Bound, deduplicate, and diversify evidence within a configured context budget.
- [x] Return insufficient context rather than force an unsupported answer.
- [x] Generate answers through a provider-neutral interface using delimited untrusted evidence.
- [x] Return and persist structured citations derived from actual retrieved chunks.
- [x] Expose validated chat operations through preload without privileged primitives.
- [x] Support cancellation and deterministic tests without network or paid providers.
- [x] Render conversations, answers, and citations accessibly.
- [x] Benchmark retrieval at 10K, 50K, and 100K chunks before choosing a scaling change.

## Architecture assessment

- Affected components: `ai`, `database`, `electron-main`, `preload`, `shared-contracts`, `renderer`
- Protected decision required: Conditional
- ADR: ADR-002 covers the intended existing boundary. A cloud provider, new datastore, separate service,
  synchronization system, or authentication architecture requires a new approved ADR before adoption.

## Tasks

### RAG-001 — Implement exact vector retrieval

Status: Verified

Purpose:
Retrieve source chunks compatible with the active embedding provider and optional managed-root/document
filters.

Dependencies:

- Approved or accepted ADR-001 and ADR-002 direction.
- Existing vectors written by `src/main/database/chunkRepository.ts:31-107`.

Acceptance criteria:

- [x] Add a retriever interface and Turso implementation using `vector_distance_cos`.
- [x] Validate embedding provider, model, and dimensions before comparing vectors.
- [x] Support bounded candidate count and validated root/document filters.
- [x] Return chunk/document identity, content, metadata, rank, and distance.
- [x] Add deterministic retrieval tests using a temporary database.

Expected verification:

- Targeted retrieval and database tests, then the complete quality suite.

Architecture impact:

- Adds retrieval within the existing main-process `ai`/`database` boundary.

Implementation:

- `TursoVectorRetriever` in `src/main/database/vectorRetriever.ts:56-132` owns exact cosine SQL,
  compatibility checks, bounded filters, deterministic ordering, and structured results.

Tests:

- `src/main/database/vectorRetriever.test.ts` covers ranking, incompatible vectors/statuses,
  root/document filtering, and invalid bounds.

Verification:

- Targeted tests, typecheck, and lint passed; included in the 57-test suite.

Commit:

- Not available.

### RAG-002 — Select evidence and enforce relevance

Status: Verified

Purpose:
Convert raw nearest-neighbor candidates into non-duplicative, relevant evidence within a token budget.

Dependencies:

- RAG-001

Acceptance criteria:

- [x] Remove duplicates and heavily overlapping adjacent chunks.
- [x] Enforce candidate, final-result, distance, and context-budget limits.
- [x] Produce a typed insufficient-context result.
- [x] Preserve stable source identifiers for prompt and citation mapping.

Expected verification:

- Unit tests for overlap, thresholds, deterministic ordering, and budget boundaries.

Architecture impact:

- None beyond the planned `ai` component responsibility.

Implementation:

- `selectEvidence` in `src/main/ai/evidenceSelector.ts:43-92` validates all bounds, filters by
  distance, removes normalized duplicates/overlaps, budgets tokens, and preserves chunk source IDs.

Tests:

- `src/main/ai/evidenceSelector.test.ts` covers duplicates, overlap, limits, stable ordering, budgets,
  thresholds, and every insufficient-context outcome.

Verification:

- Targeted tests, typecheck, and lint passed; included in the 57-test suite.

Commit:

- Not available.

### RAG-003 — Implement grounded generation orchestration

Status: Verified

Purpose:
Generate an answer from selected evidence while preventing retrieved instructions from gaining
application authority.

Dependencies:

- RAG-002
- Product choice and approval for the first generation provider.

Acceptance criteria:

- [x] Define a cancellable provider-neutral `GenerationProvider`.
- [x] Delimit evidence and require supplied source identifiers in the prompt.
- [x] Do not invoke generation when evidence is insufficient.
- [x] Map citations from retrieval records rather than trusting model markup.
- [x] Classify provider errors without logging prompts, source text, answers, or credentials.

Expected verification:

- Deterministic service tests with fake embedding, retrieval, and generation providers.

Architecture impact:

- A cloud provider is a protected external dependency and requires approval plus security disclosure.

Implementation:

- `src/main/ai/generationProvider.ts` defines the cancellable provider contract and content-free error
  categories.
- `GroundedAnswerService` at `src/main/ai/groundedAnswerService.ts:64-114` embeds, retrieves, selects,
  delimits untrusted evidence, invokes generation, and maps only actual source records.
- `LocalServerGenerationProvider` validates a loopback-only, credential-free OpenAI-compatible
  endpoint and performs bounded, cancellable, non-streaming chat-completion requests.

Tests:

- `src/main/ai/groundedAnswerService.test.ts` uses fake providers to cover prompt injection text,
  invented citations, insufficient context, and sanitized provider failures.

Verification:

- Deterministic orchestration tests, typecheck, and lint passed; included in the 57-test suite.

Commit:

- Not available.

### RAG-004 — Persist conversations and evidence

Status: Verified

Purpose:
Retain conversations and the exact evidence used by each generated answer.

Dependencies:

- RAG-003

Acceptance criteria:

- [x] Add versioned migrations and repositories for conversations and messages.
- [x] Preserve evidence snapshots or immutable source records so citations remain reproducible after
      re-indexing.
- [x] Define deletion and retention behavior.
- [x] Preserve atomicity between a persisted answer and its citations.

Expected verification:

- Temporary-database migration, persistence, restart, deletion, and rollback tests.

Architecture impact:

- Extends the approved Turso schema; database ownership remains unchanged.

Implementation:

- Migration 3 at `src/main/database/migrations.ts:59-97` adds conversations, messages, and immutable
  citation snapshots.
- `ConversationRepository` at `src/main/database/conversationRepository.ts:38-172` retains history
  locally until explicit deletion, atomically appends exchanges/citations, and cascades deletion.

Tests:

- `src/main/database/conversationRepository.test.ts` covers restart persistence, immutable evidence,
  transactional rollback, and cascade deletion.

Verification:

- Database tests, typecheck, and lint passed; included in the 57-test suite.

Commit:

- Not available.

### RAG-005 — Add typed index and chat IPC

Status: Verified

Purpose:
Expose task-level indexing and chat capabilities without exposing database, filesystem, or provider
primitives.

Dependencies:

- RAG-001 through RAG-004 contracts.

Acceptance criteria:

- [x] Define serializable question, answer, citation, and conversation contracts.
- [x] Add validated operations for index status, re-index, retry, and citation reveal.
- [x] Add validated operations for ask, cancel, conversation read/list, and delete.
- [x] Reject unknown chat fields, invalid identifiers, and requests without active managed roots.
- [x] Add preload/main chat IPC integration tests.

Expected verification:

- Preload and IPC tests plus type checking.

Architecture impact:

- Extends the existing preload boundary without bypassing it.

Implementation:

- `src/main/chatIpc.ts` validates trusted task-level chat/settings/history calls, scopes retrieval to
  active watched roots, owns cancellation controllers, and composes retrieval and generation.
- `src/preload/index.ts` exposes only the serializable operations declared in shared contracts.
- `src/main/indexIpc.ts` exposes aggregate/per-document status, managed re-index/retry controls,
  canonical citation reveal, and privacy-safe diagnostic clear/export operations.

Tests:

- `src/main/chatIpc.test.ts` covers exact payloads, untrusted senders, persistence, citation mapping,
  deletion, settings, and cancellation with a deterministic fake answer service.
- `src/preload/index.test.ts` verifies shared channels are used by the bridge.
- `src/main/indexIpc.test.ts` covers status, queue/chunk counts, retry/re-index, trusted senders,
  managed canonical reveal, diagnostic clearing, and redacted export.

Verification:

- Included in the 100-test suite; typecheck and lint pass.

Commit:

- Not available.

### RAG-006 — Build indexing and chat UI

Status: Verified

Purpose:
Present index progress, failures, conversations, grounded answers, and structured sources.

Dependencies:

- RAG-005

Acceptance criteria:

- [x] Show global and per-document indexing states and retry/re-index actions.
- [x] Add accessible question submission, cancellation, loading, empty, and failure states.
- [x] Display structured source excerpts and metadata separately from answer markup.
- [x] Reveal a cited file only through a validated main-process operation.
- [x] Add renderer tests for state transitions, cancellation, insufficient context, and citations.

Expected verification:

- Renderer tests, type checking, lint, and production build.

Architecture impact:

- Renderer remains presentation-only.

Implementation:

- `ChatPanel` configures the local server, submits/cancels questions, loads/deletes retained
  conversations, and renders answer text and citation snapshots as separate content.
- `IndexStatusPanel` polls bounded index snapshots, displays queue/document stages and failures,
  supports retry/re-index, and presents privacy-safe timing/storage diagnostics.
- Aggregate status covers the complete index while per-document IPC results are capped at the 200 most
  recently updated records. Polls are serialized so a slow request cannot accumulate overlaps.
- Citation reveal is routed through validated main-process IPC and the system file manager.

Tests:

- `chatPresentation.test.ts` covers answering/cancelling/completion, insufficient context, and
  structured citation presentation.
- `indexPresentation.test.ts` covers queue/stage activity and terminal-state presentation.
- `IndexStatusPanel.test.tsx` proves a pending status request prevents another poll from starting.

Verification:

- Included in the 100-test suite; renderer typecheck and lint pass.

Commit:

- Not available.

### RAG-007 — Benchmark and release-verify retrieval

Status: Partially verified — local benchmarks complete; packaged scenarios require external runners

Purpose:
Measure whether exact vector search is adequate and verify packaged RAG behavior.

Dependencies:

- RAG-001 through RAG-006
- IDX-002

Acceptance criteria:

- [x] Record retrieval latency and memory at 10K, 50K, and 100K chunks.
- [ ] Record indexing/provider latency and database size without user content.
- [ ] Verify restart, offline behavior, cancellation, and citations in packaged applications.
- [ ] Create a separate approved design before adding approximate indexing, sync, or a new service.

Expected verification:

- Benchmark report and supported-platform package checks.

Architecture impact:

- Measurements do not alter architecture; follow-on scaling changes may be protected.

Implementation:

- `scripts/benchmark-retrieval.mjs` creates disposable synthetic 384-dimensional datasets and records
  exact cosine retrieval latency, process RSS, database size, and incremental insertion time.
- `docs/benchmarks/retrieval-2026-10-04.md` records the environment, method, results, and decision to
  retain exact retrieval for the initial local release.

Tests:

- The benchmark validates that every measured query returns the requested 20 rows and removes its
  temporary database.

Verification:

- `pnpm benchmark:retrieval` passed at 10K, 50K, and 100K chunks. Median retrieval was 26.57 ms,
  146.01 ms, and 299.71 ms respectively on the recorded local environment.

Commit:

- Not available.

## Decisions / blockers

- The first provider is the approved user-managed loopback OpenAI-compatible server in ADR-004.
- Conversation history is retained locally until explicit deletion. Database encryption remains
  unresolved.
- Retrieval quality thresholds require representative evaluation data.
- Cloud providers, synchronization, new services, and new datastores require protected-decision
  approval.

## Handoff

- Authorized: All active tasks; ADR-001, ADR-002, and ADR-003 were explicitly approved.
- Implemented: Retrieval, evidence selection, grounded local generation, conversation persistence,
  typed chat/index IPC, cancellation, local settings, chat/index status UI, validated citation
  reveal, and privacy-safe diagnostics.
- Verified: The 100-test suite, typecheck, lint, production build, and project validation pass.
- Remaining: Provider/end-to-end packaged measurements and broader packaged verification.
- Risks/blockers: Encryption policy, representative evaluation data, and cross-platform runners.
- Next action: Run packaged end-to-end scenarios on supported platform runners.
