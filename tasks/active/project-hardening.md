# Feature: Core application hardening

Status: Verified locally — clean-runner release evidence remains

## Feature intent

Complete the non-RAG reliability, validation, renderer-state, reproducibility, and documentation work
needed for a dependable folder-watching application.

## Feature acceptance criteria

- [ ] Clean installs and all documented quality checks are reproducible.
- [x] Normal filesystem races do not turn a healthy watcher into a terminal error.
- [x] Rejected IPC calls do not leave hydration or watcher actions in incoherent states.
- [x] Privileged IPC handlers enforce payload and sender policies with integration coverage.
- [x] Selection and details state cannot reference removed or stale files.
- [x] Contributor and release documentation accurately separates implemented and planned behavior.

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
- [x] Confirm all Markdown, including legacy compatibility files, passes formatting.
- [x] Align documented Node.js and pnpm requirements with CI configuration.
- [x] Run and pass Prettier, lint, typecheck, tests, and production build together.
- [x] Eliminate package-manager warnings that indicate ignored security/build configuration.

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

- On 2026-10-03, the existing checkout passed lint, both typechecks, 24 tests, and the production
  build. This does not replace clean-checkout verification.

Verification:

- On 2026-10-04, frozen offline installation, repository-wide Prettier, lint, typecheck, 100 tests,
  production build, and project validation passed in the existing checkout.
- pnpm still reports the explicitly ignored transitive `tesseract.js@7.0.0` build script; README
  documents that this is intentional because OCR is disabled.
- `shamefullyHoist` now lives in `pnpm-workspace.yaml`; npm no longer reports it as an unknown project
  configuration value. Frozen offline installation succeeds in the existing checkout.
- A genuinely clean checkout/store remains unverified.

Commit:

- Results observed at `2db71a3`; no hardening fix implemented.

### HARD-002 — Harden watcher and renderer error handling

Status: Verified

Purpose:
Keep transient filesystem and IPC failures recoverable without stale or misleading UI state.

Dependencies:

- None.

Acceptance criteria:

- [x] Distinguish watcher-level failures from transient per-path metadata failures.
- [x] Handle files disappearing between Chokidar events and `stat()` without failing the watcher.
- [x] Define whether transient metadata failures are ignored, retried, or shown as non-fatal errors.
- [x] Catch failures from `getWatcherState()` and `getWatchedFiles()` during renderer hydration.
- [x] Guarantee hydration exits safely and pending event buffers remain bounded after an IPC failure.
- [x] Catch folder-removal and stop-watching failures.
- [x] Preserve or restore visible files when a destructive watcher action fails.
- [x] Disable or serialize watcher controls while add/remove/stop actions are pending.
- [x] Present consistent, actionable errors and allow retry.

Expected verification:

- Watcher race unit tests and renderer tests for rejected initialization/action promises.

Architecture impact:

- No boundary change.

Implementation:

- `src/main/watcher.ts:127-150` treats per-path metadata races as removals without turning the watcher
  terminal; Chokidar watcher-level errors remain terminal.
- `src/renderer/src/App.tsx:15-108` bounds hydration events, catches hydration and action failures,
  restores the prior snapshot after destructive failures, and disables controls while pending.

Tests:

- `src/renderer/src/App.test.tsx` covers rejected hydration, failed destructive actions with snapshot
  restoration, and a successful watched-folder replacement through the rendered application tree.
- `src/main/watcher.test.ts` covers transient metadata races and watcher-level errors.

Verification:

- The complete 100-test suite, renderer typecheck, lint, and production build passed on 2026-10-04.

Commit:

- Not available.

### HARD-003 — Strengthen IPC and renderer trust-boundary validation

Status: Verified

Purpose:
Prevent malformed or unauthorized renderer input from reaching native folder and watcher operations.

Dependencies:

- The trusted main-frame and navigation policy documented in `architecture/CONTRACT.yaml` and
  `docs/security.md`.

Acceptance criteria:

- [x] Centralize runtime validation for every existing IPC payload.
- [x] Reject non-array folder arguments, empty paths, unknown fields, and malformed values clearly.
- [x] Define and document sender-frame and origin validation.
- [x] Apply sender validation consistently to privileged handlers.
- [x] Deny top-level navigation outside trusted application content so remote pages cannot inherit the
      preload bridge.
- [x] Keep HTTP/HTTPS external-link opening separate from renderer navigation and reject other URL
      schemes.
- [x] Keep path canonicalization and directory checks in the main process.
- [x] Separate handler registration from bootstrap sufficiently for isolated tests.
- [x] Test folder selection, watcher start/replace/stop, state, snapshot, malformed input, sender policy,
      settings persistence/restoration, and invalid/inaccessible saved folders.
- [x] Test top-level navigation, new-window denial, allowed external links, and rejected URL schemes.

Expected verification:

- Main/preload IPC integration tests without launching the full desktop UI.

Architecture impact:

- Must preserve ADR-002 and the preload boundary. Authentication/authorization changes are protected.

Implementation:

- `src/main/ipc.ts:12-83` centralizes sender-frame/origin, argument-count, and folder payload
  validation in independently testable handler registration.
- `src/main/index.ts:48-103` preserves sandboxing, denies untrusted top-level navigation, denies every
  new window, and opens only HTTP/HTTPS links externally.

Tests:

- `src/main/ipc.test.ts` covers every handler, sender-frame/origin policy, malformed folders, argument
  counts, trusted/untrusted top-level navigation, new-window denial, allowed external links, and
  rejected schemes. `src/main/settings.test.ts` covers persistence and malformed settings; watcher
  tests cover invalid/inaccessible saved paths.

Verification:

- Lint, typecheck, and the 100-test suite passed on 2026-10-04.

Commit:

- Defects observed at `2db71a3`; no fix implemented.

### HARD-004 — Reconcile renderer selection and details state

Status: Verified

Purpose:
Keep list, card, selection, and details state coherent after live events and watcher replacement.

Dependencies:

- None.

Acceptance criteria:

- [x] Remove paths from `selectedPaths` when files leave the active snapshot.
- [x] Close details when its file is deleted or no longer belongs to the active watcher.
- [x] Refresh `detailsFile` when metadata for the same path changes.
- [x] Clear selection/details when changing or stopping watched folders.
- [x] Define whether select-all affects only filtered files while preserving hidden selections.
- [x] Prevent the select-all checkbox from reporting all-selected for an empty result.
- [x] Test deletion, watcher replacement, filtering, metadata changes, and both views.

Expected verification:

- Reducer/provider/component tests plus the normal renderer quality checks.

Architecture impact:

- Renderer-only state behavior.

Implementation:

- `src/renderer/src/components/files_table/FilesProvider.tsx:9-59` derives selection/details only
  from the active snapshot, refreshes details metadata, preserves hidden filtered selections, and
  clears all view state on watcher replacement.
- `src/renderer/src/App.tsx:15-108` bounds hydration events, handles rejected hydration/actions,
  restores visible files after failed destructive actions, and serializes controls.

Tests:

- `src/renderer/src/fileState.test.ts` covers deletion, metadata refresh, filtered hidden selections,
  visible select-all, and empty results.
- `src/renderer/src/App.test.tsx` drives the rendered list/card views through selection, details,
  filtering, live metadata changes, deletion, and watched-folder replacement.

Verification:

- Renderer state and component tests pass as part of the 100-test suite; renderer typecheck, lint, and
  production build pass.

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
- [x] Update platform-support claims without overstating the Linux x64 package smoke result.
- [x] Document known watcher, parser, retrieval, and packaging limitations in one discoverable place.

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

- pnpm reports an intentionally ignored transitive `tesseract.js` build script; the policy and warning
  are documented because OCR remains disabled.
- Platform claims depend on clean-machine packaged application verification.

## Handoff

- Authorized: All pending tasks that do not require a protected owner decision.
- Implemented: Watcher/renderer error recovery, IPC sender/payload and navigation controls, coherent
  selection/details state, repository formatting, and current limitations documentation.
- Verified: Frozen offline install in the existing checkout, Prettier, lint, typecheck, 100 tests,
  production build, project validation, and Linux x64 packaged native/parser smoke.
- Remaining: Clean-checkout and clean-machine cross-platform release evidence.
- Risks/blockers: Clean runners and Windows/macOS machines are unavailable locally; pnpm reports the
  intentionally ignored OCR dependency build script.
- Next action: Run the package-check workflow on clean cross-platform runners.
