# Feature: Durable local document indexing

Status: Partially implemented — cross-platform and encrypted-document verification incomplete

## Feature intent

Maintain a durable local Turso knowledge base from supported files in watched folders, using bounded
and cancellable extraction, chunking, and deterministic local embeddings.

## Feature acceptance criteria

- [x] Open one embedded Turso database below Electron's user-data directory.
- [x] Apply versioned migrations and replace documents/chunks transactionally.
- [x] Reconcile watched files after restart and skip unchanged compatible content.
- [x] Support text, Markdown, DOCX, PPTX, XLSX, ODT, ODP, ODS, PDF, RTF, and EPUB policies.
- [x] Preserve generalized page/slide/sheet/chapter metadata in chunks.
- [x] Cancel superseded queue and provider work on a best-effort basis.
- [x] Prevent stale generations and deleted paths from committing durable state.
- [x] Enforce canonical containment for every watched file access, including directory symlinks and
      path swaps.
- [x] Atomically clear prior chunks when current content is successfully classified as
      empty/non-indexable.
- [x] Cover every enabled Office format with a real deterministic fixture.
- [ ] Verify Turso and OfficeParser behavior in packaged Linux, Windows, and macOS applications.
- [x] Obtain approval for ADR-001, ADR-002, and ADR-003 or revise the implementation.
- [x] Pass the complete project verification suite in the final implementation state.

## Architecture assessment

- Affected components: `electron-main`, `watcher`, `ingestion`, `ai`, `database`
- Protected decision required: Yes — approved on 2026-10-03
- ADRs:
  - `architecture/decisions/ADR-001-embedded-turso-knowledge-base.md`
  - `architecture/decisions/ADR-002-main-process-rag-boundary.md`
  - `architecture/decisions/ADR-003-officeparser-document-extraction.md`

The datastore, external parser dependency, and cross-component ownership choices are approved.

## Tasks

### IDX-001 — Verify real-format extraction fixtures

Status: Implemented — encrypted-document coverage remains

Purpose:
Prove extraction structure, cancellation, limits, and sanitized failures for every advertised format.

Dependencies:

- Existing OfficeParser adapter and file policy.

Acceptance criteria:

- [x] Add deterministic DOCX, PPTX, XLSX, ODT, ODP, ODS, PDF, and EPUB fixtures.
- [x] Assert headings, pages, slides, sheets, chapters, and representative table/list content.
- [ ] Assert malformed, encrypted, empty, oversized, and archive-limit outcomes.
- [x] Assert parser cancellation and bounded resource-limit behavior.

Expected verification:

- `pnpm test -- src/main/ingestion`
- `pnpm test -- src/main/database`

Architecture impact:

- None identified; tests exercise existing boundaries.

Implementation:

- `scripts/generate-office-fixtures.mjs` deterministically creates every binary fixture plus a
  compressed DOCX that exceeds the 64 MB expansion limit.
- `src/main/ingestion/extractors/officeParser.test.ts` exercises real DOCX, PPTX, XLSX, ODT, ODP,
  ODS, PDF, RTF, and EPUB content and generalized source metadata.

Tests:

- Real-format, malformed, cancellation, and archive-limit tests pass. Encrypted-document behavior is
  not yet covered by a deterministic fixture.

Verification:

- `pnpm test -- src/main/ingestion/extractors/officeParser.test.ts` passed as part of the 57-test
  suite on 2026-10-03.

Commit:

- Not available.

### IDX-002 — Verify packaged native and parser assets

Status: Partially implemented — Linux x64 unpacked smoke verified

Purpose:
Confirm that Turso native binaries and OfficeParser dependencies work from installed artifacts.

Dependencies:

- IDX-001

Acceptance criteria:

- [x] Verify packaged Linux x64 and configured Linux targets.
- [ ] Verify packaged Windows x64.
- [ ] Verify packaged macOS ARM64.
- [ ] Resolve whether macOS x64 is supported.
- [x] Confirm ASAR unpack behavior and PDF worker/runtime asset availability on Linux x64.
- [ ] Record any required `electron-builder.yml` changes.

Expected verification:

- `pnpm build`
- `pnpm build:unpack`
- Native package-check workflow on each supported operating system.

Architecture impact:

- May require packaging changes but must not move parsing or database ownership out of main process.

Implementation:

- `scripts/packaged-smoke.mjs:1-38` opens packaged Turso, executes SQL, and parses an in-memory RTF
  through packaged OfficeParser.
- `package.json` exposes `pnpm test:package:linux`.

Tests:

- Not implemented.

Verification:

- `pnpm build:unpack` passed on Linux x64 on 2026-10-03.
- `pnpm test:package:linux` passed against `dist/linux-unpacked`; the packaged ASAR contained the
  Linux x64 Turso binary and PDF.js worker/runtime assets.
- Windows, macOS, Linux ARM64, and installed-artifact checks remain pending.

Commit:

- Not available.

### IDX-003 — Ratify protected indexing decisions

Status: Verified

Purpose:
Resolve the framework-required approval state for Turso, main-process ownership, and OfficeParser.

Dependencies:

- Project owner review.

Acceptance criteria:

- [x] Approve, reject, or supersede ADR-001.
- [x] Approve, reject, or supersede ADR-002.
- [x] Approve, reject, or supersede ADR-003.
- [x] Align `architecture/CONTRACT.yaml` and implementation with the approved outcome.

Expected verification:

- Architecture review against `architecture/CONTRACT.yaml`.

Architecture impact:

- Protected decisions; an agent must not self-approve them.

Implementation:

- ADR-001, ADR-002, and ADR-003 were explicitly approved by the project owner on 2026-10-03; their
  records now have `Status: Approved` and match `architecture/CONTRACT.yaml`.

Tests:

- Not applicable.

Verification:

- Architecture records and the contract were reviewed for status and boundary consistency.

Commit:

- Not available.

### IDX-004 — Enforce canonical watched-root containment

Status: Verified locally — cross-platform behavior remains under IDX-002

Purpose:
Ensure every file read, hash, and extraction remains confined to an explicitly managed canonical
watched root despite directory symlinks, path replacement, and platform path semantics.

Dependencies:

- None.

Acceptance criteria:

- [x] Disable directory-symlink traversal in the watcher under the current reject-symlinks policy.
- [x] Canonicalize each file target immediately before privileged access and require it to be within
      an active canonical root.
- [x] Reject intermediate-component symlinks and regular-file-to-symlink swaps without indexing or
      exposing the external target.
- [x] Define canonical document identity for nested roots, platform case behavior, and display paths.
- [x] Hash and extract one already-bounded file snapshot instead of reopening the source path.
- [x] Recheck the bounded snapshot size so a post-policy file growth cannot bypass the 10 MB limit.
- [x] Add deterministic tests for a directory symlink escape, final-component symlink, path swap,
      nested roots, and files removed during validation.

Expected verification:

- `pnpm test -- src/main/watcher.test.ts src/main/ingestion/ingestion.test.ts`
- `pnpm lint`
- `pnpm typecheck`

Architecture impact:

- Enforces the existing filesystem boundary in `architecture/CONTRACT.yaml`; no boundary change or
  protected decision is required.

Implementation:

- Chokidar disables symlink traversal at `src/main/watcher.ts:83-87`.
- `openFileSnapshot` canonicalizes root and target, rejects symlinks and inode swaps, rechecks size,
  and returns one byte snapshot at `src/main/ingestion/filePolicy.ts:136-221`.
- Hashing and every extractor consume that same snapshot through
  `src/main/ingestion/ingestionCoordinator.ts:197-250` and `src/main/ingestion/extractText.ts`.

Tests:

- `src/main/watcher.test.ts` covers directory-symlink non-traversal.
- `src/main/ingestion/ingestion.test.ts` covers final/intermediate symlink rejection, deterministic
  regular-file replacement with an external symlink, removal during validation, nested-root identity,
  bounded snapshot reads, and oversized snapshots. Platform-specific case behavior remains under the
  packaged platform matrix.

Verification:

- Focused watcher/ingestion tests and the complete 100-test suite, lint, typecheck, and build passed on
  2026-10-04.

Commit:

- Defect observed at `2db71a3`; no fix implemented.

### IDX-005 — Make ingestion commits generation-safe and chunk-consistent

Status: Verified locally

Purpose:
Ensure successful replacements, cancellations, deletions, and reconciliation cannot leave stale
chunks, resurrect deleted records, or allow an older generation to overwrite newer state.

Dependencies:

- IDX-004 for canonical path and active-root identity.

Acceptance criteria:

- [x] Replace a successfully processed empty/non-indexable document with zero chunks atomically, or
      delete its prior chunks in an equivalent transaction while retaining the intended status.
- [x] Permit the unchanged-content fast path only when the durable status and chunk state are
      compatible; never turn a skipped empty document back into an indexed stale document.
- [x] Validate generation freshness and active-root membership inside the serialized document/chunk
      mutation.
- [x] Serialize deletion or use a tombstone/generation condition so pending status or replacement
      writes cannot recreate a deleted record.
- [x] Prevent startup reconciliation from deleting a previous valid index based on an incomplete
      watcher-ready snapshot.
- [x] Preserve previous valid chunks on extraction or embedding failure without exposing them as the
      current successfully indexed content.
- [x] Add deterministic race tests for change-during-commit, delete-during-status-write,
      delete-during-replacement, root removal, empty replacement, and watcher-ready reconciliation.

Expected verification:

- `pnpm test -- src/main/ingestion src/main/database`
- `pnpm lint`
- `pnpm typecheck`

Architecture impact:

- Enforces the existing `ingestion`/`database` ownership boundary and atomic replacement policy. No
  new datastore or ownership change is proposed.

Implementation:

- Root removal, file deletion, reconciliation, status updates, and replacements share the mutation
  serialization boundary at `src/main/ingestion/ingestionCoordinator.ts:54-94` and `:169-188`.
- Generation and active-root freshness are checked inside that boundary before every mutation.
- Empty and successfully non-indexable replacements call transactional `replaceDocument` with zero
  chunks at `src/main/ingestion/ingestionCoordinator.ts:201-225` and `:254-273`.
- The unchanged fast path now requires a compatible durable `indexed` status at `:236-244`.

Tests:

- `src/main/ingestion/ingestion.test.ts` uses a deterministic serialized-mutation barrier to cover a
  newer change during atomic replacement and deletion during queued-status and replacement writes;
  it also covers zero-chunk replacement and root removal.
- Watcher, queue, and database tests cover complete ready snapshots, cancellation, and transactional
  rollback.

Verification:

- Ingestion/database tests and the complete 100-test suite, lint, typecheck, and production build
  passed on 2026-10-04.

Commit:

- Defects observed at `2db71a3`; no fix implemented.

## Decisions / blockers

- Encrypted-document fixture coverage remains incomplete.
- Complete platform support cannot be claimed until packaged builds pass on every supported target.
- macOS x64 compatibility is unresolved.

## Handoff

- Authorized: All active tasks; ADR-001, ADR-002, and ADR-003 are approved.
- Implemented: Canonical snapshots, generation-safe mutations, zero-chunk replacement, deterministic
  real-format fixtures, archive-limit coverage, and Linux x64 packaged smoke verification.
- Verified: Prettier, lint, typecheck, 100 tests, production build, project validation, deterministic
  fixture regeneration, Linux x64 unpacked build, ASAR inspection, and packaged native/parser smoke.
- Remaining: Encrypted-document fixture coverage and Windows/macOS/Linux ARM64 package and
  installed-artifact checks.
- Risks/blockers: Cross-platform runners/clean machines and an encrypted fixture generator.
