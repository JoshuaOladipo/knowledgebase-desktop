# PC Agent RAG Roadmap

This roadmap covers the future work required to turn the existing folder watcher into a local-first Retrieval Augmented Generation (RAG) desktop application. RAG services, credentials, filesystem access, and Turso access must remain in Electron's main process. The preload layer should expose only typed, task-oriented IPC operations, while the renderer remains presentation-only.

## P0 — Establish durable Turso storage

- [ ] Create a main-process database service that opens one embedded Turso database at `app.getPath('userData')/knowledge-base.db`, runs migrations during startup, and closes cleanly during shutdown.

  Target code: `src/main/database/database.ts`, `src/main/database/migrations.ts`, `src/main/index.ts`

  Acceptance criteria:
  - The database survives application restarts.
  - Startup fails with a useful application error if the database cannot be opened or migrated.
  - The database connection is never exposed to the preload or renderer.

- [ ] Add versioned migrations for `documents`, `chunks`, and `schema_migrations`.

  Target code: `src/main/database/migrations.ts`

  Store document identity, canonical path, watched root, MIME type, size, modification time, content hash, ingestion status, error, and timestamps. Store chunk ordinal, content, token count, source offsets, optional heading/page metadata, embedding, embedding model, and embedding dimensions.

- [ ] Implement typed document and chunk repositories with prepared statements and transaction-scoped document replacement.

  Target code: `src/main/database/documentRepository.ts`, `src/main/database/chunkRepository.ts`

  Acceptance criteria:
  - Re-indexing a document atomically replaces its previous chunks.
  - Deleting a document also deletes its chunks.
  - A failed replacement leaves the previously committed document index intact.

- [ ] Add integration tests using an isolated temporary Turso database.

  Target code: `src/main/database/*.test.ts`

  Cover migrations, restart persistence, upserts, atomic chunk replacement, deletion, and rollback behavior.

## P0 — Build the ingestion pipeline

- [ ] Define supported document types, maximum file sizes, binary-file detection, symlink behavior, and ignored path patterns.

  Target code: `src/main/ingestion/filePolicy.ts`

  Start with UTF-8 plain text and Markdown. Unsupported, oversized, unreadable, and binary files must receive explicit non-fatal statuses.

- [ ] Introduce a text extractor interface and implement deterministic plain-text and Markdown extractors.

  Target code: `src/main/ingestion/extractText.ts`, `src/main/ingestion/extractors/plainText.ts`, `src/main/ingestion/extractors/markdown.ts`

  Extraction results should contain normalized text plus source metadata needed for citations, such as headings and character offsets.

- [ ] Implement a structure-aware, deterministic chunker.

  Target code: `src/main/ingestion/chunkText.ts`

  Initial defaults:
  - Target 500–800 tokens per chunk.
  - Overlap 80–120 tokens.
  - Preserve paragraph and Markdown heading boundaries when possible.
  - Do not emit empty or trivially small chunks.

- [ ] Add a content-hash utility and an embedding-configuration fingerprint.

  Target code: `src/main/ingestion/contentHash.ts`

  Skip ingestion only when the content hash, embedding provider, model, dimensions, extraction version, and chunking version all match the stored values.

- [ ] Implement a bounded, deduplicating ingestion queue.

  Target code: `src/main/ingestion/ingestionQueue.ts`, `src/main/ingestion/ingestionCoordinator.ts`

  Acceptance criteria:
  - Rapid changes to the same path collapse into the latest job.
  - Files are processed only after their size and modification time stabilize.
  - Stale path generations cannot commit over newer generations.
  - Pending work can be cancelled on deletion, folder removal, reconfiguration, or shutdown.
  - Initial concurrency is conservative and configurable.

- [ ] Connect watcher `add`, `change`, and `unlink` events to the ingestion coordinator without adding RAG responsibilities to `WatcherService`.

  Target code: `src/main/index.ts`, `src/main/watcher.ts`, `src/main/ingestion/ingestionCoordinator.ts`

  An unlink event must cancel pending work and remove the indexed document. Stopping a watcher must not silently erase the durable knowledge base unless the product explicitly requests removal.

- [ ] Reconcile watched files with the database after startup.

  Target code: `src/main/ingestion/ingestionCoordinator.ts`

  Detect files missed while the application was closed, enqueue new or changed files, and remove records for files that no longer exist beneath active roots.

## P0 — Add embedding generation

- [ ] Define an `EmbeddingProvider` abstraction with model name, dimensions, batching, cancellation, and retry semantics.

  Target code: `src/main/ai/embeddingProvider.ts`

- [ ] Implement the first embedding provider behind configuration rather than coupling ingestion to a specific vendor.

  Target code: `src/main/ai/providers/`, `src/main/config/aiSettings.ts`

  Acceptance criteria:
  - Embeddings are generated in batches.
  - Transient failures use bounded exponential backoff.
  - Authentication and permanent input errors are not retried indefinitely.
  - API keys never cross into the renderer or appear in logs.

- [ ] Persist embeddings with Turso `vector32()` and validate dimensions before insertion.

  Target code: `src/main/database/chunkRepository.ts`

- [ ] Detect embedding configuration changes and provide a controlled full re-index operation.

  Target code: `src/main/ingestion/ingestionCoordinator.ts`, `src/main/config/aiSettings.ts`

- [ ] Add unit tests with a deterministic fake embedding provider.

  Target code: `src/main/ai/*.test.ts`, `src/main/ingestion/*.test.ts`

  Tests must not call paid or network-hosted models.

## P1 — Implement retrieval

- [ ] Implement a retriever interface and an exact Turso cosine-distance retriever using `vector_distance_cos`.

  Target code: `src/main/retrieval/retriever.ts`, `src/main/database/chunkRepository.ts`

  The query must support a result limit and optional watched-root, document, and path filters.

- [ ] Retrieve a wider candidate set, remove duplicate or heavily overlapping adjacent chunks, and enforce a context token budget.

  Target code: `src/main/retrieval/resultDiversifier.ts`, `src/main/retrieval/contextSelector.ts`

- [ ] Return structured retrieval results containing chunk ID, document ID, canonical path, name, heading/page metadata, excerpt, rank, and distance.

  Target code: `src/shared/ragContracts.ts`

- [ ] Add relevance safeguards.

  Target code: `src/main/retrieval/retriever.ts`

  Include configurable candidate count, final context count, maximum distance, and a no-relevant-context outcome. Do not force the model to answer when retrieval confidence is insufficient.

- [ ] Build a retrieval benchmark fixture for 10K, 50K, and 100K chunks.

  Target code: `src/main/retrieval/retrieval.bench.ts`

  Record latency and memory usage. Turso's current exact distance ordering may scan all chunk embeddings, so keep retrieval behind an interface that can later use approximate vector indexing or hybrid prefiltering.

## P1 — Implement grounded answer generation

- [ ] Define a `GenerationProvider` abstraction with cancellation and usage metadata.

  Target code: `src/main/ai/generationProvider.ts`

- [ ] Implement the first generation provider behind application configuration.

  Target code: `src/main/ai/providers/`, `src/main/config/aiSettings.ts`

- [ ] Implement `RagService` to embed the question, retrieve evidence, assemble a bounded prompt, invoke generation, and return structured citations.

  Target code: `src/main/ai/ragService.ts`, `src/main/ai/promptBuilder.ts`

- [ ] Harden prompt assembly against instructions contained in indexed documents.

  Target code: `src/main/ai/promptBuilder.ts`

  Retrieved text must be clearly delimited and treated as untrusted evidence. The model should acknowledge missing evidence, avoid inventing citations, and cite only source identifiers supplied in the prompt.

- [ ] Persist conversations, messages, and the exact source chunks used for each answer.

  Target code: `src/main/database/conversationRepository.ts`, `src/main/database/migrations.ts`

- [ ] Add deterministic RAG orchestration tests using fake embedding, retrieval, and generation providers.

  Target code: `src/main/ai/ragService.test.ts`

  Cover successful grounded answers, no relevant context, provider failure, cancellation, context truncation, and citation mapping.

## P1 — Extend the typed Electron boundary

- [ ] Add serializable contracts for index status, per-document status, re-index requests, questions, answers, citations, conversations, and cancellation.

  Target code: `src/shared/ragContracts.ts`, `src/shared/contracts.ts`

- [ ] Add narrow IPC handlers for:
  - Reading index status.
  - Subscribing to indexing events.
  - Re-indexing selected paths or all active roots.
  - Asking a question.
  - Cancelling an active request.
  - Reading and deleting conversations.

  Target code: `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] Validate every IPC payload in the main process and reject unknown fields, invalid limits, and paths outside managed roots.

  Target code: `src/main/ipc/validation.ts`, `src/main/index.ts`

- [ ] Add integration tests for every new preload/main IPC contract.

  Target code: `src/preload/index.test.ts`, `src/main/ipc/*.test.ts`

## P2 — Build indexing and chat interfaces

- [ ] Display global indexing progress and per-file states: queued, extracting, chunking, embedding, indexed, skipped, and error.

  Target code: `src/renderer/src/components/indexing/`, `src/renderer/src/App.tsx`

- [ ] Add actions to retry a failed document, re-index selected documents, and re-index the complete knowledge base.

  Target code: `src/renderer/src/components/indexing/`

- [ ] Add a chat workspace with conversation history, request cancellation, loading/error/empty states, and keyboard-accessible controls.

  Target code: `src/renderer/src/components/chat/`

- [ ] Render answer citations from structured source data and show source excerpts and metadata.

  Target code: `src/renderer/src/components/chat/Sources.tsx`

  Do not trust citation markup generated in answer text as the source of truth.

- [ ] Add a validated main-process command for revealing a cited file in the native file manager.

  Target code: `src/shared/contracts.ts`, `src/main/index.ts`, `src/preload/index.ts`

- [ ] Add renderer tests for indexing status transitions, question submission, cancellation, errors, empty retrieval, and citation rendering.

  Target code: `src/renderer/src/**/*.test.tsx`

## P2 — Expand document support

- [ ] Add PDF extraction with page-number citation metadata.

  Target code: `src/main/ingestion/extractors/pdf.ts`

- [ ] Add DOCX extraction with heading and paragraph metadata.

  Target code: `src/main/ingestion/extractors/docx.ts`

- [ ] Evaluate and prioritize additional formats such as HTML, CSV, JSON, and source code.

  Target code: `src/main/ingestion/extractors/`

- [ ] Add malformed, encrypted, oversized, and adversarial fixture files for every extractor.

  Target code: `src/main/ingestion/fixtures/`, `src/main/ingestion/extractors/*.test.ts`

## P2 — Security, privacy, and configuration

- [ ] Store provider secrets using operating-system credential storage; do not write them to `settings.json`, the Turso database, renderer state, or logs.

  Target code: `src/main/config/secretStore.ts`

- [ ] Add a clear local-versus-cloud data disclosure before enabling a cloud embedding or generation provider.

  Target code: `src/renderer/src/components/settings/`

- [ ] Add configurable model, batch size, retrieval limits, context budget, file-size limits, and supported-file settings with safe bounds.

  Target code: `src/main/config/aiSettings.ts`, `src/renderer/src/components/settings/`

- [ ] Add log redaction and structured diagnostics that exclude source text, prompts, answers, embeddings, and credentials by default.

  Target code: `src/main/diagnostics/`

- [ ] Decide whether the local Turso database should use encryption at rest and document the key recovery and rotation behavior.

  Target code: `src/main/database/database.ts`, `README.md`

- [ ] Threat-model prompt injection, malicious file parsing, path traversal, symlink escape, resource exhaustion, citation spoofing, and accidental cloud disclosure.

  Target documentation: `docs/security.md`

## P3 — Reliability, packaging, and release readiness

- [ ] Verify the Turso native module in packaged Linux x64/ARM64, Windows x64, and macOS ARM64 applications.

  Target code: `electron-builder.yml`, `.github/workflows/package-check.yml`

- [ ] Resolve macOS x64 support explicitly because the currently installed `@tursodatabase/database` package does not declare a Darwin x64 native binary.

  Target code: `package.json`, `electron-builder.yml`, release documentation

- [ ] Verify whether Turso native binaries require explicit ASAR unpack rules and revisit `npmRebuild: false`.

  Target code: `electron-builder.yml`

- [ ] Add graceful shutdown that drains or cancels ingestion, aborts model requests, commits completed work, and closes Turso before exit.

  Target code: `src/main/index.ts`, `src/main/ingestion/ingestionCoordinator.ts`, `src/main/database/database.ts`

- [ ] Add recovery tests for interruption during extraction, embedding, document replacement, migration, and application shutdown.

  Target code: `src/main/**/*.test.ts`

- [ ] Add end-to-end tests covering folder selection, initial indexing, file changes, deletion, retrieval, answer generation, citations, restart persistence, and offline/provider-error behavior.

  Target code: `tests/e2e/`

- [ ] Add opt-in telemetry or local diagnostics for indexing duration, extraction failures, provider latency, retrieval latency, chunk counts, and database size.

  Target code: `src/main/diagnostics/`

- [ ] Document the final RAG architecture, database schema, data flow, supported formats, provider configuration, privacy behavior, troubleshooting, testing, and packaging requirements.

  Target documentation: `README.md`, `docs/rag-architecture.md`

## P3 — Optional future enhancements

- [ ] Evaluate hybrid lexical and vector retrieval after measuring exact vector retrieval quality and performance.

- [ ] Evaluate reranking for ambiguous or large candidate sets.

- [ ] Evaluate fully local embedding and generation models for an offline-only mode.

- [ ] Evaluate `@tursodatabase/sync` as an explicit opt-in feature for backup or cross-device synchronization.

- [ ] Add streaming answer IPC only after cancellation, ordering, cleanup, and non-streaming behavior are reliable.

- [ ] Add approximate vector indexing when it is stable in the selected Turso deployment and benchmarks justify the migration.
