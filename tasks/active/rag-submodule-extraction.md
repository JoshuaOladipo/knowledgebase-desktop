# Feature: Extract the RAG engine into an independently developed Git submodule

Status: Planning — architecture approval and target repository required

## Feature intent

Move the non-UI retrieval-augmented generation implementation into a separately versioned Git
repository mounted in this application as a submodule, while preserving the existing Electron
security boundary, local database, behavior, and user data.

The extracted package should run in the Electron main process as a Node-only library. It should own
document policy and extraction, chunking, embedding, ingestion coordination, Turso schema and
repositories, retrieval, evidence selection, answer generation, and conversation persistence. The
PC Agent repository should remain responsible for Electron lifecycle and native UI integrations,
folder watching, settings persistence, diagnostics presentation, IPC validation and mapping,
preload, and renderer code.

## Feature acceptance criteria

- [ ] A new approved ADR defines the repository/package boundary, ownership of the knowledge-base
      schema, public contracts, compatibility policy, and release workflow.
- [ ] The RAG code is consumed through one documented public package API; PC Agent has no deep
      imports into submodule internals and receives no raw Turso connection or repository object.
- [ ] The submodule has no Electron, preload, renderer, or PC Agent IPC dependency.
- [ ] The submodule owns ingestion, extraction, chunking, embedding, retrieval, evidence selection,
      generation providers, conversation persistence, migrations, RAG unit/integration tests,
      fixtures, and retrieval benchmarks.
- [ ] PC Agent retains the watcher, Electron composition, settings-file persistence, diagnostics
      storage/export, IPC/preload contracts, native file reveal, shutdown ordering, and all UI code.
- [ ] Existing `knowledge-base.db` files open and migrate in place without data loss, database reset,
      or forced re-indexing solely because the code moved.
- [ ] Existing renderer-visible behavior and IPC payloads remain backward compatible during the
      extraction.
- [ ] Canonical containment, bounded snapshot extraction, generation-safe mutations, cancellation,
      prompt-injection handling, remote-generation disclosure, and credential isolation remain
      enforced.
- [ ] The submodule can install, build, type-check, lint, and test independently on Node 22.
- [ ] PC Agent CI checks out the pinned submodule recursively and verifies host contract tests, the
      local end-to-end RAG flow, production build, and packaged native/parser smoke tests.
- [ ] Parent releases record an immutable submodule commit; no build or release follows a floating
      branch.
- [ ] Developer and release documentation covers clone, update, two-repository change, rollback, and
      dependency/security-update workflows.

## Architecture assessment

- Affected components: `electron-main`, `watcher`, `ingestion`, `ai`, `database`,
  `shared-contracts`, `preload`, packaging, CI, and documentation.
- Protected decision required: Yes — this changes cross-component data ownership and introduces a
  separately versioned repository/package dependency.
- ADR: Add `architecture/decisions/ADR-006-rag-core-submodule-boundary.md`; approval is required
  before implementation.
- Existing decisions: ADR-001, ADR-002, ADR-003, and ADR-005 remain applicable. The extracted code
  must still execute in the Electron main process; this plan does not introduce a service, broker,
  datastore, renderer privilege, cloud sync path, or authentication mechanism.

### Recommended boundary

Move to the submodule:

- `src/main/ai/**`, including provider-neutral contracts and concrete local/OpenAI-compatible
  providers.
- `src/main/ingestion/**`, including extractors, fixtures, queueing, reconciliation, and file policy.
- `src/main/database/**`, including the Turso connection, schema migrations, repositories,
  retrieval, and conversation persistence.
- The embedding configuration fingerprint/default-provider logic currently in
  `src/main/config/aiSettings.ts`.
- `src/main/ragE2e.test.ts`, RAG unit/integration tests, `scripts/benchmark-retrieval.mjs`, and
  `scripts/generate-office-fixtures.mjs`.

Keep in PC Agent:

- `src/main/watcher.ts`; watching folders is an application input adapter and already has a strict
  no-ingestion/no-database boundary.
- `src/main/index.ts`, `chatIpc.ts`, `indexIpc.ts`, `ipc.ts`, `settings.ts`, `diagnostics.ts`, and
  `shutdown.ts`, refactored to consume only the public RAG API.
- `src/shared/**`, `src/preload/**`, and `src/renderer/**`; these remain application-facing IPC and UI
  contracts. The host maps them to structurally separate RAG domain DTOs.
- `scripts/packaged-smoke.mjs`, changed to exercise the installed public RAG package rather than
  reaching into dependency paths, because packaged Electron behavior is a host integration concern.
- Product ADRs, integration architecture, release checklist, and existing historical task records.

### Proposed public API

Expose a small Node-only facade (working name `@pc-agent/rag-core`) with explicit package exports:

- `openRagEngine({ databasePath, embeddingProvider, metrics })` and `close()`; the host supplies the
  database path but never receives the database connection.
- Ingestion operations for active roots, file events/snapshots, reconciliation, re-index, retry,
  idle/drain, and queue state.
- Index queries for bounded document status, counts, database size, and indexed-document lookup.
- Question answering and conversation list/read/delete operations, accepting a generation provider
  and cancellation signal.
- Stable provider ports and DTOs: embedding, generation, metric recording, source-file events,
  answers/citations, conversations, and status records.
- Concrete local-hash embedding and OpenAI-compatible generation providers plus their validators.

Do not export Turso's `Database`, SQL repositories, migrations, OfficeParser objects, or internal
module paths. Keep package `exports` allowlisted so host code cannot accidentally create a second
integration surface.

## Tasks

### RAGSUB-001 — Approve the component and repository boundary

Status: Pending approval

Purpose:
Make data ownership and security consequences explicit before changing code or Git topology.

Dependencies:

- Product-owner review.
- Target repository URL, visibility, and access policy.

Acceptance criteria:

- [ ] Draft ADR-006 with the recommended boundary, alternatives, consequences, and rollback path.
- [ ] Confirm that the submodule is an in-process Node library, not a separately deployable service.
- [ ] Assign knowledge-base schema and migration ownership to `rag-core` while PC Agent retains the
      database file location and application lifecycle.
- [ ] Confirm that watched documents remain read-only user input and settings/provider credentials
      remain owned by Electron main.
- [ ] Define semantic-versioning rules for the public API and the parent repository's pinned-commit
      update policy.
- [ ] Update `architecture/CONTRACT.yaml` only after ADR approval.

Expected verification:

- Architecture review against the contract and ADR-001/002/003/005.

Architecture impact:

- Protected cross-component ownership and external repository/package decision; an agent must not
  self-approve it.

Implementation:

- Not implemented.

Tests:

- Not applicable.

Verification:

- Pending approval.

Commit:

- Not available.

### RAGSUB-002 — Establish a narrow RAG facade in the current repository

Status: Pending

Purpose:
Remove application imports of concrete repositories and raw database types before the physical move.

Dependencies:

- RAGSUB-001

Acceptance criteria:

- [ ] Add the proposed engine facade and domain DTOs while code still lives in PC Agent.
- [ ] Refactor `index.ts`, `chatIpc.ts`, and `indexIpc.ts` to use only the facade/provider ports.
- [ ] Keep IPC validation and conversion to/from `src/shared/contracts.ts` in PC Agent.
- [ ] Remove raw `@tursodatabase/database` types and repository construction from host IPC modules.
- [ ] Replace deep imports with one temporary public barrel matching the eventual package exports.
- [ ] Add contract tests proving the host can use a fake facade and one integration test proving the
      facade drives the real database, ingestion, retrieval, generation, and conversation flow.

Expected verification:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`

Architecture impact:

- Introduces the approved boundary without changing repository topology or user-visible behavior.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGSUB-003 — Seed and validate the independent `rag-core` repository

Status: Pending

Purpose:
Create a self-contained package with useful history and independent quality gates.

Dependencies:

- RAGSUB-002

Acceptance criteria:

- [ ] Extract the selected paths from a throwaway clone using a history-preserving tool; do not
      rewrite the working PC Agent repository in place.
- [ ] Normalize the extracted layout to `src/`, `test/`, `fixtures/`, `scripts/`, and `docs/` without
      importing parent-repository files.
- [ ] Add package metadata, Node 22/type-system configuration, explicit runtime dependencies,
      package exports, license, README, security notes, and contribution guidance.
- [ ] Build CommonJS-compatible output for the current Electron main consumer (and ESM too if the
      selected build tool can guarantee equivalent behavior), plus declarations and source maps.
- [ ] Move RAG tests, fixtures, fixture generation, and benchmarks; replace application shared types
      with package-owned domain types.
- [ ] Add independent CI for format, lint, typecheck, tests, build, dependency review, and artifact
      inspection.
- [ ] Verify the package from a clean standalone clone, not only inside the parent workspace.

Expected verification:

- Fresh-clone frozen install, format check, lint, typecheck, RAG unit/integration tests, package
  build, and package-content inspection.

Architecture impact:

- Creates the approved independent repository. Native/parser dependencies move to the package.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGSUB-004 — Add the repository as a pinned workspace submodule

Status: Pending

Purpose:
Consume the independent package locally without publishing it or following a mutable branch.

Dependencies:

- RAGSUB-003

Acceptance criteria:

- [ ] Add the submodule at `packages/rag-core` and include `packages/*` in
      `pnpm-workspace.yaml`.
- [ ] Add `@pc-agent/rag-core` as a workspace dependency and remove duplicated root-only RAG runtime
      dependencies after packaging proves transitive dependency discovery works.
- [ ] Ensure host typecheck/build depends on generated package declarations/output rather than
      private source paths.
- [ ] Update Electron/Vite externalization deliberately: the packaged main process must resolve the
      package's CommonJS entry and its Turso/OfficeParser runtime dependencies.
- [ ] Update all CI checkout steps to use recursive submodules and fail clearly when the submodule is
      absent or uninitialized.
- [ ] Pin an exact submodule commit and document the required core-first, parent-pointer-second push
      order.

Expected verification:

- Clean recursive clone, frozen workspace install, package build, host typecheck/test/build, and
  inspection of `out/main/index.js` and the unpacked application dependency tree.

Architecture impact:

- Changes build and source topology, but preserves in-process execution and existing trust boundaries.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGSUB-005 — Cut over host composition and remove duplicated source

Status: Pending

Purpose:
Make the submodule the sole implementation source while retaining PC Agent as the integration shell.

Dependencies:

- RAGSUB-004

Acceptance criteria:

- [ ] Compose/open one RAG engine from `app.getPath('userData')/knowledge-base.db` during bootstrap.
- [ ] Adapt watcher events and complete ready snapshots into the package ingestion contracts.
- [ ] Adapt RAG answer, citation, conversation, index-status, and errors into existing IPC DTOs.
- [ ] Preserve host ownership of active request IDs, trusted-sender checks, native reveal validation,
      settings persistence, diagnostics export, and shutdown ordering.
- [ ] Remove the old `src/main/ai`, `src/main/ingestion`, `src/main/database`, and migrated config code
      only after parity tests pass.
- [ ] Remove direct host imports of `@tursodatabase/database` and `officeparser`.
- [ ] Prove the existing database schema version and data open in place, including conversations and
      citation snapshots.

Expected verification:

- Host contract tests, a fixture database upgrade/reopen test, the complete local end-to-end RAG
  test, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

Architecture impact:

- Completes the approved data/code ownership transfer. No renderer or preload privileges change.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGSUB-006 — Verify packaged and cross-platform behavior

Status: Pending

Purpose:
Catch workspace/submodule, ASAR, native Turso, and OfficeParser failures that source tests cannot.

Dependencies:

- RAGSUB-005

Acceptance criteria:

- [ ] Update the packaged smoke test to load the public package API and exercise a real database plus
      an OfficeParser extraction without assuming a hoisted dependency path.
- [ ] Verify Linux x64 unpacked and configured installer targets.
- [ ] Verify Windows x64 and macOS ARM64 package builds and runtime smoke tests.
- [ ] Resolve existing macOS x64 and Linux ARM64 support decisions separately rather than claiming
      unsupported targets.
- [ ] Confirm the packaged artifact contains one intended copy/version of the RAG package and all
      required native/parser assets.
- [ ] Confirm a clean application upgrade retains and opens an existing knowledge base.

Expected verification:

- `pnpm build:unpack`
- `pnpm test:package:linux`
- The configured package-check matrix plus runtime smoke on each supported OS.

Architecture impact:

- None beyond the approved package boundary; verifies delivery correctness.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### RAGSUB-007 — Complete documentation, compatibility, and operational handoff

Status: Pending

Purpose:
Make independent development sustainable after the one-time extraction.

Dependencies:

- RAGSUB-006

Acceptance criteria:

- [ ] Update `README.md`, `docs/rag-architecture.md`, architecture paths, active task references, and
      release checklist without rewriting historical records inaccurately.
- [ ] Document recursive clone/init/update commands, detached submodule commits, core-first pull
      requests, parent pointer bumps, rollback, and release tagging.
- [ ] Define a compatibility matrix between PC Agent releases, package semantic versions, schema
      versions, and pinned submodule commits.
- [ ] Define where vulnerabilities and dependency updates for Turso and OfficeParser are triaged.
- [ ] Add an automated boundary check that rejects Electron/renderer imports in the package and deep
      package imports in PC Agent.
- [ ] Record final paths, symbols, tests, verification, and commits in this task and related active
      records.

Expected verification:

- Project validator, link/path review, clean-clone onboarding rehearsal, and release-checklist review.

Architecture impact:

- Aligns documentation and enforcement with the approved boundary.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

## Decisions / blockers

- ADR-006 and the matching architecture-contract update require explicit project-owner approval.
- The target Git repository URL, visibility, license, package name, and access policy are not yet
  selected.
- The recommended boundary keeps Chokidar and watched-folder selection in PC Agent. Moving the watcher
  too would make the package a desktop file-monitoring subsystem rather than a reusable RAG engine.
- Git submodules improve repository independence but add two-repository change coordination and
  recursive-checkout requirements. The public API and pinned-SHA policy are mandatory mitigations.
- Electron Builder's handling of the pnpm workspace package and transitive native/parser dependencies
  must be proven from packaged artifacts before deleting root dependency declarations.
- Existing active task records contain paths and line references that will become stale and must be
  updated during cutover.

## Handoff

- Authorized: Evaluation and planning only; creation of this durable plan. No application or Git
  topology changes are authorized yet.
- Implemented: Repository assessment and extraction plan only.
- Verified: On 2026-10-04, the current pre-extraction baseline passed `pnpm typecheck` and
  `pnpm test` (25 files, 109 tests).
- Remaining: RAGSUB-001 through RAGSUB-007.
- Risks/blockers: Architecture approval, target repository decisions, package/host API design, pnpm
  workspace packaging, native Turso delivery, OfficeParser assets, schema compatibility, and
  cross-platform runners.
- Next action: Review and approve/revise ADR-006 scope and provide the target repository URL; then
  implement RAGSUB-002 before creating or mounting the submodule.
