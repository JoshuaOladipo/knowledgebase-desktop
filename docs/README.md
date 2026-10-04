# Project documentation

- [`rag-architecture.md`](rag-architecture.md) describes the current indexing implementation, the
  target retrieval-and-generation architecture, assumptions, boundaries, data flow, and risks.
- [`security.md`](security.md) records the security and privacy rules for watched files, native
  parsers, IPC, Turso, and future model providers.
- [`release-checklist.md`](release-checklist.md) is the canonical packaging, clean-machine, signing,
  publication, and supported-platform checklist.
- [`../architecture/CONTRACT.yaml`](../architecture/CONTRACT.yaml) is the authoritative component and
  dependency contract.
- [`../architecture/decisions/`](../architecture/decisions/) contains proposed architectural decision
  records requiring project approval.
- [`../tasks/active/`](../tasks/active/) contains durable plans and handoffs for unfinished work.

`README.md` remains the concise setup and user-facing feature guide. Documentation in this directory
must distinguish implemented behavior from planned behavior.
