# ADR-002: Keep privileged RAG capabilities in the Electron main process

Status: Approved

## Context

Indexing requires filesystem access, native parsers, a database connection, and potentially provider
credentials. The renderer displays untrusted indexed content and should not gain those privileges.
This cross-component ownership decision is protected by `architecture/CONTRACT.yaml`.

## Decision / proposal

Keep watcher, ingestion, extraction, database, retrieval, generation, secrets, and native file
operations in the Electron main process. Keep the renderer presentation-only. Expose typed,
serializable, task-level use cases through preload and validate their payloads and sender frames in
main-process IPC handlers. Application windows must reject top-level navigation outside trusted
application content so remote content cannot inherit the preload bridge.

Keep `WatcherService` independent of ingestion. It emits filesystem events; `IngestionCoordinator`
owns slow, cancellable indexing work. A cancellation signal alone is not a commit guard: ingestion
must revalidate generation freshness and active-root membership in the same serialized boundary as a
document replacement or deletion.

## Alternatives considered

- Renderer-hosted RAG exposes privileged capabilities to web content.
- A generic SQL or filesystem bridge bypasses ownership and validation boundaries.
- A separate local service adds deployment and authentication concerns without demonstrated need.

## Consequences

- Main-process work must be bounded, asynchronous, and cancellable.
- Shared contracts contain serializable data only.
- Renderer features require explicit preload and IPC contracts.
- Privileged IPC requires a trusted sender frame in addition to a valid payload.
- Database replacement and deletion must not be commit-able by stale ingestion generations.
- Prompt-injected text cannot directly invoke privileged capabilities.

## Affected components

- `electron-main`, `watcher`, `ingestion`, `ai`, `database`, `preload`, `shared-contracts`, `renderer`

## Related tasks

- `tasks/active/rag-retrieval-and-chat.md`
- `tasks/active/indexing-release-verification.md`
- `tasks/active/project-hardening.md`
