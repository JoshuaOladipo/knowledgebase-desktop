# ADR-001: Embedded Turso knowledge base

Status: Proposed — retrospective approval required

## Context

PC Agent needs durable local storage for document metadata, extracted chunks, ingestion state, and
embeddings without operating a separate database service. The repository currently uses
`@tursodatabase/database` and opens `knowledge-base.db` beneath Electron's per-user data directory.

Introducing a datastore is protected by `architecture/CONTRACT.yaml`. This ADR records the already
implemented direction but does not self-approve it.

## Decision / proposal

Use one embedded Turso database owned exclusively by the Electron main process. Open it during
bootstrap, apply ordered migrations, and close it during graceful shutdown. Store embeddings as
Turso `vector32` values and hide SQL behind main-process repositories.

Cloud synchronization is excluded. Adding it requires a separate protected decision because it
introduces remote data movement and an external dependency.

## Alternatives considered

- In-memory state loses work at restart.
- JSON files require application-level transactions and vector queries.
- A remote database adds deployment, availability, privacy, and authentication concerns.
- Another embedded vector store remains viable, but Turso already supplies the required SQL and
  vector operations.

## Consequences

- Renderer and preload code cannot access the database directly.
- Schema changes require versioned migrations and tests.
- Exact vector search must be benchmarked as chunk counts grow.
- Native Turso binaries require packaged-target verification.
- Encryption and cloud sync remain separate decisions.

## Affected components

- `electron-main`
- `database`
- `ingestion`
- `ai`

## Related tasks

- `tasks/active/rag-retrieval-and-chat.md`
- `tasks/active/indexing-release-verification.md`
