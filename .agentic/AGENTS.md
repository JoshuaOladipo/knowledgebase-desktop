# Agentic Development Framework Instructions

Apply project root instructions, `architecture/CONTRACT.yaml`, and `.agentic-local/` overrides in addition to these defaults.

## Required workflow
1. Use durable task records under `tasks/active/`.
2. Planning requests do not authorize implementation.
3. Implement only explicitly authorized task IDs.
4. Respect the architecture contract; block protected architectural changes for approval.
5. Add/update tests and documentation for changed behavior.
6. Record actual implementation paths, current line ranges, useful symbols, tests, and commit IDs when available.
7. Never fabricate verification, paths, line numbers, symbols, or commits.
8. Use `Implemented` when verification is incomplete; `Verified` only after required checks pass.
9. Record newly discovered non-trivial work instead of silently expanding scope.
10. Leave a durable handoff so another agent can continue without chat history.

## Communication
Before coding: authorized scope, material assumptions, blockers, architecture decisions.
After coding: implemented/unimplemented scope, actual verification results, architecture/documentation impact, risks, and task-record path.
