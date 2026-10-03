# Durable task records

- `active/` contains authorized or proposed work that is incomplete or not fully verified.
- `completed/` contains work whose acceptance criteria and required verification are complete.

Task records are the durable handoff. They must contain stable task IDs, real repository references,
acceptance criteria, verification evidence, architecture impact, and current status. `Verified` is used
only after every required check passes.

Current active records:

- `indexing-release-verification.md`: real-format fixtures and indexing architecture approval.
- `rag-retrieval-and-chat.md`: retrieval, generation, citations, IPC, persistence, and UI.
- `rag-security-reliability-and-future.md`: formats, secrets, configuration, diagnostics, recovery,
  end-to-end tests, encryption, and deferred enhancements.
- `project-hardening.md`: package reproducibility, watcher/renderer errors, IPC, and UI state.
- `release-readiness.md`: native packages, installed runtime scenarios, signing, and publishing.
