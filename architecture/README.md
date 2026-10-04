# Architecture records

`CONTRACT.yaml` is the authoritative component and dependency-boundary contract for PC Agent.
Changes that introduce a protected decision require explicit approval and normally an ADR.

The `decisions/` directory records material architectural choices. An ADR marked `Proposed`
documents an implemented or intended choice that has not yet been formally ratified; existing code
does not make that decision approved automatically.

Current architecture documentation lives in `docs/rag-architecture.md`. Active implementation and
verification work lives under `tasks/active/`.
