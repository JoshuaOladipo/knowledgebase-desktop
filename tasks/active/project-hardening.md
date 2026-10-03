# Feature: Core application hardening

Status: Planning

## Feature intent

Complete the non-RAG reliability, validation, renderer-state, reproducibility, and documentation work
needed for a dependable folder-watching application.

## Feature acceptance criteria

- [ ] Clean installs and all documented quality checks are reproducible.
- [ ] Normal filesystem races do not turn a healthy watcher into a terminal error.
- [ ] Rejected IPC calls do not leave hydration or watcher actions in incoherent states.
- [ ] Privileged IPC handlers enforce payload and sender policies with integration coverage.
- [ ] Selection and details state cannot reference removed or stale files.
- [ ] Contributor and release documentation accurately separates implemented and planned behavior.

## Architecture assessment

- Affected components: `electron-main`, `watcher`, `preload`, `shared-contracts`, `renderer`
- Protected decision required: No, unless sender validation introduces authentication/authorization
  architecture or a new external dependency.
- ADR: None currently.

## Tasks

### HARD-001 — Make package management and quality checks reproducible

Status: Partially implemented

Purpose:
Ensure clean checkouts use the same supported toolchain and dependency-build policy as CI.

Dependencies:

- None.

Acceptance criteria:

- [x] Pin pnpm 10 through the `packageManager` field.
- [x] Move dependency build-script policy to `pnpm-workspace.yaml` for the pinned pnpm version.
- [ ] Confirm `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] Confirm all Markdown, including legacy compatibility files, passes formatting.
- [x] Align documented Node.js and pnpm requirements with CI configuration.
- [ ] Run and pass Prettier, lint, typecheck, tests, and production build together.
- [ ] Eliminate package-manager warnings that indicate ignored security/build configuration.

Expected verification:

- `pnpm install --frozen-lockfile`
- `pnpm exec prettier --check .`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Architecture impact:

- None identified.

Implementation:

- Tool versions and workspace build policy are present in `package.json:4`,
  `pnpm-workspace.yaml:1-9`, and `.github/workflows/ci.yml:10-25`.

Tests:

- Full clean-checkout verification remains pending.

Verification:

- Documentation-only checks do not satisfy this task.

Commit:

- Not available.

### HARD-002 — Harden watcher and renderer error handling

Status: Pending

Purpose:
Keep transient filesystem and IPC failures recoverable without stale or misleading UI state.

Dependencies:

- None.

Acceptance criteria:

- [ ] Distinguish watcher-level failures from transient per-path metadata failures.
- [ ] Handle files disappearing between Chokidar events and `stat()` without failing the watcher.
- [ ] Define whether transient metadata failures are ignored, retried, or shown as non-fatal errors.
- [ ] Catch failures from `getWatcherState()` and `getWatchedFiles()` during renderer hydration.
- [ ] Guarantee hydration exits safely and pending event buffers remain bounded after an IPC failure.
- [ ] Catch folder-removal and stop-watching failures.
- [ ] Preserve or restore visible files when a destructive watcher action fails.
- [ ] Disable or serialize watcher controls while add/remove/stop actions are pending.
- [ ] Present consistent, actionable errors and allow retry.

Expected verification:

- Watcher race unit tests and renderer tests for rejected initialization/action promises.

Architecture impact:

- No boundary change.

Implementation:

- Not implemented as a complete behavior set.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### HARD-003 — Strengthen existing watcher IPC validation

Status: Pending

Purpose:
Prevent malformed or unauthorized renderer input from reaching native folder and watcher operations.

Dependencies:

- A documented sender/frame/origin policy.

Acceptance criteria:

- [ ] Centralize runtime validation for every existing IPC payload.
- [ ] Reject non-array folder arguments, empty paths, unknown fields, and malformed values clearly.
- [ ] Define and document sender-frame and origin validation.
- [ ] Apply sender validation consistently to privileged handlers.
- [ ] Keep path canonicalization and directory checks in the main process.
- [ ] Separate handler registration from bootstrap sufficiently for isolated tests.
- [ ] Test folder selection, watcher start/replace/stop, state, snapshot, malformed input, sender policy,
      settings persistence/restoration, and invalid/inaccessible saved folders.

Expected verification:

- Main/preload IPC integration tests without launching the full desktop UI.

Architecture impact:

- Must preserve ADR-002 and the preload boundary. Authentication/authorization changes are protected.

Implementation:

- Existing typed channels are present, but centralized runtime and sender validation are incomplete.

Tests:

- Existing preload contract coverage is not sufficient for these acceptance criteria.

Verification:

- Not run.

Commit:

- Not available.

### HARD-004 — Reconcile renderer selection and details state

Status: Pending

Purpose:
Keep list, card, selection, and details state coherent after live events and watcher replacement.

Dependencies:

- None.

Acceptance criteria:

- [ ] Remove paths from `selectedPaths` when files leave the active snapshot.
- [ ] Close details when its file is deleted or no longer belongs to the active watcher.
- [ ] Refresh `detailsFile` when metadata for the same path changes.
- [ ] Clear selection/details when changing or stopping watched folders.
- [ ] Define whether select-all affects only filtered files while preserving hidden selections.
- [ ] Prevent the select-all checkbox from reporting all-selected for an empty result.
- [ ] Test deletion, watcher replacement, filtering, metadata changes, and both views.

Expected verification:

- Reducer/provider/component tests plus the normal renderer quality checks.

Architecture impact:

- Renderer-only state behavior.

Implementation:

- Not implemented as a complete behavior set.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### HARD-005 — Keep contributor and release documentation current

Status: Partially implemented

Purpose:
Make implemented behavior, planned behavior, setup, verification, and release limitations discoverable.

Dependencies:

- HARD-001 verification results.
- Release verification results before claiming platform support.

Acceptance criteria:

- [x] Distinguish implemented indexing from planned retrieval/chat in `README.md` and canonical docs.
- [x] Link canonical architecture, task, and security documentation.
- [x] Document pinned Node.js and pnpm versions.
- [ ] Document only commands proven from a clean checkout.
- [x] Document current watched-file and indexing behavior and format limits.
- [x] Move the release checklist into `docs/release-checklist.md`.
- [ ] Update platform-support claims after clean-machine package verification.
- [ ] Document known watcher, parser, retrieval, and packaging limitations in one discoverable place.

Expected verification:

- Link review, Prettier, agentic validator, and manual comparison against implemented behavior.

Architecture impact:

- None.

Implementation:

- Canonical documentation exists under `docs/`, `tasks/`, and `architecture/`.

Tests:

- Documentation validation only.

Verification:

- Clean-checkout and package claims remain unverified.

Commit:

- Not available.

## Decisions / blockers

- IPC sender/origin policy requires a deliberate security decision.
- Platform claims depend on clean-machine packaged application verification.

## Handoff

- Authorized: Planning/documentation migration only.
- Implemented: Durable task coverage for the full non-RAG backlog.
- Verified: No application behavior verification claimed.
- Remaining: HARD-001 through HARD-005 unchecked criteria.
- Risks/blockers: IPC sender policy, clean-checkout reproducibility, native package verification.
- Next action: Authorize HARD-001 or HARD-002 as a bounded implementation task.
