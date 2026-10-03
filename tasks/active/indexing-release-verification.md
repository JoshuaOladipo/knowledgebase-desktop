# Feature: Durable local document indexing

Status: Partially implemented — security, integrity, verification, and architecture approval incomplete

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
- [ ] Prevent stale generations and deleted paths from committing durable state.
- [ ] Enforce canonical containment for every watched file access, including directory symlinks and
      path swaps.
- [ ] Atomically clear prior chunks when current content is successfully classified as
      empty/non-indexable.
- [ ] Cover every enabled Office format with a real deterministic fixture.
- [ ] Verify Turso and OfficeParser behavior in packaged Linux, Windows, and macOS applications.
- [ ] Obtain approval for ADR-001, ADR-002, and ADR-003 or revise the implementation.
- [ ] Pass the complete project verification suite in the final implementation state.

## Architecture assessment

- Affected components: `electron-main`, `watcher`, `ingestion`, `ai`, `database`
- Protected decision required: Yes
- ADRs:
  - `architecture/decisions/ADR-001-embedded-turso-knowledge-base.md`
  - `architecture/decisions/ADR-002-main-process-rag-boundary.md`
  - `architecture/decisions/ADR-003-officeparser-document-extraction.md`

The datastore, external parser dependency, and cross-component ownership choices existed before this
task record and remain proposed pending explicit approval.

## Tasks

### IDX-001 — Verify real-format extraction fixtures

Status: Pending

Purpose:
Prove extraction structure, cancellation, limits, and sanitized failures for every advertised format.

Dependencies:

- Existing OfficeParser adapter and file policy.

Acceptance criteria:

- [ ] Add deterministic DOCX, PPTX, XLSX, ODT, ODP, ODS, PDF, and EPUB fixtures.
- [ ] Assert headings, pages, slides, sheets, chapters, and representative table/list content.
- [ ] Assert malformed, encrypted, empty, oversized, and archive-limit outcomes.
- [ ] Assert parser cancellation and bounded resource-limit behavior.

Expected verification:

- `pnpm test -- src/main/ingestion`
- `pnpm test -- src/main/database`

Architecture impact:

- None identified; tests exercise existing boundaries.

Implementation:

- Partial RTF coverage exists at `src/main/ingestion/extractors/officeParser.test.ts:1` and
  `src/main/ingestion/fixtures/sample.rtf`.

Tests:

- Additional fixtures and tests not implemented.

Verification:

- Not run for this documentation update.

Commit:

- Not available.

### IDX-002 — Verify packaged native and parser assets

Status: Pending

Purpose:
Confirm that Turso native binaries and OfficeParser dependencies work from installed artifacts.

Dependencies:

- IDX-001

Acceptance criteria:

- [ ] Verify packaged Linux x64 and configured Linux targets.
- [ ] Verify packaged Windows x64.
- [ ] Verify packaged macOS ARM64.
- [ ] Resolve whether macOS x64 is supported.
- [ ] Confirm ASAR unpack behavior and PDF worker/runtime asset availability.
- [ ] Record any required `electron-builder.yml` changes.

Expected verification:

- `pnpm build`
- `pnpm build:unpack`
- Native package-check workflow on each supported operating system.

Architecture impact:

- May require packaging changes but must not move parsing or database ownership out of main process.

Implementation:

- Not implemented.

Tests:

- Not implemented.

Verification:

- Not run.

Commit:

- Not available.

### IDX-003 — Ratify protected indexing decisions

Status: Blocked pending project approval

Purpose:
Resolve the framework-required approval state for Turso, main-process ownership, and OfficeParser.

Dependencies:

- Project owner review.

Acceptance criteria:

- [ ] Approve, reject, or supersede ADR-001.
- [ ] Approve, reject, or supersede ADR-002.
- [ ] Approve, reject, or supersede ADR-003.
- [ ] Align `architecture/CONTRACT.yaml` and implementation with the approved outcome.

Expected verification:

- Architecture review against `architecture/CONTRACT.yaml`.

Architecture impact:

- Protected decisions; an agent must not self-approve them.

Implementation:

- Proposed ADRs written; approval not granted.

Tests:

- Not applicable.

Verification:

- Pending approval.

Commit:

- Not available.

### IDX-004 — Enforce canonical watched-root containment

Status: Pending — security defect reproduced

Purpose:
Ensure every file read, hash, and extraction remains confined to an explicitly managed canonical
watched root despite directory symlinks, path replacement, and platform path semantics.

Dependencies:

- None.

Acceptance criteria:

- [ ] Disable directory-symlink traversal in the watcher under the current reject-symlinks policy.
- [ ] Canonicalize each file target immediately before privileged access and require it to be within
      an active canonical root.
- [ ] Reject intermediate-component symlinks and regular-file-to-symlink swaps without indexing or
      exposing the external target.
- [ ] Define canonical document identity for nested roots, platform case behavior, and display paths.
- [ ] Hash and extract one already-bounded file snapshot instead of reopening the source path.
- [ ] Recheck the bounded snapshot size so a post-policy file growth cannot bypass the 10 MB limit.
- [ ] Add deterministic tests for a directory symlink escape, final-component symlink, path swap,
      nested roots, and files removed during validation.

Expected verification:

- `pnpm test -- src/main/watcher.test.ts src/main/ingestion/ingestion.test.ts`
- `pnpm lint`
- `pnpm typecheck`

Architecture impact:

- Enforces the existing filesystem boundary in `architecture/CONTRACT.yaml`; no boundary change or
  protected decision is required.

Implementation:

- Watched roots are canonicalized in `src/main/watcher.ts:10-31`.
- Chokidar is created without overriding its default `followSymlinks: true` behavior at
  `src/main/watcher.ts:83-87`.
- `pathIsInside` performs lexical `resolve`/`relative` checks at
  `src/main/ingestion/ingestionCoordinator.ts:26-30`.
- `inspectFile` uses `lstat` only on the final path component at
  `src/main/ingestion/filePolicy.ts:67-115`.
- Hashing and extractors read the source path independently at
  `src/main/ingestion/ingestionCoordinator.ts:183-199`.

Tests:

- Existing watcher and ingestion tests do not cover directory symlinks, canonical target escape, or
  path swaps.

Verification:

- On 2026-10-03, a focused runtime probe with the installed Chokidar version observed
  `root/linked/external.txt` while its canonical target was outside the canonical watched root.
- Static review confirmed no descendant `realpath` containment check before ingestion.

Commit:

- Defect observed at `2db71a3`; no fix implemented.

### IDX-005 — Make ingestion commits generation-safe and chunk-consistent

Status: Pending — correctness defects identified

Purpose:
Ensure successful replacements, cancellations, deletions, and reconciliation cannot leave stale
chunks, resurrect deleted records, or allow an older generation to overwrite newer state.

Dependencies:

- IDX-004 for canonical path and active-root identity.

Acceptance criteria:

- [ ] Replace a successfully processed empty/non-indexable document with zero chunks atomically, or
      delete its prior chunks in an equivalent transaction while retaining the intended status.
- [ ] Permit the unchanged-content fast path only when the durable status and chunk state are
      compatible; never turn a skipped empty document back into an indexed stale document.
- [ ] Validate generation freshness and active-root membership inside the serialized document/chunk
      mutation.
- [ ] Serialize deletion or use a tombstone/generation condition so pending status or replacement
      writes cannot recreate a deleted record.
- [ ] Prevent startup reconciliation from deleting a previous valid index based on an incomplete
      watcher-ready snapshot.
- [ ] Preserve previous valid chunks on extraction or embedding failure without exposing them as the
      current successfully indexed content.
- [ ] Add deterministic race tests for change-during-commit, delete-during-status-write,
      delete-during-replacement, root removal, empty replacement, and watcher-ready reconciliation.

Expected verification:

- `pnpm test -- src/main/ingestion src/main/database`
- `pnpm lint`
- `pnpm typecheck`

Architecture impact:

- Enforces the existing `ingestion`/`database` ownership boundary and atomic replacement policy. No
  new datastore or ownership change is proposed.

Implementation:

- The unchanged fast path marks a matching record indexed at
  `src/main/ingestion/ingestionCoordinator.ts:191-195`.
- The zero-chunk path updates only the document at
  `src/main/ingestion/ingestionCoordinator.ts:200-215`; chunk deletion occurs only inside
  `ChunkRepository.replaceDocument` at `src/main/database/chunkRepository.ts:50-118`.
- Generation freshness is last checked before replacement at
  `src/main/ingestion/ingestionCoordinator.ts:218-247`; the transaction receives no generation or
  active-root condition.
- Deletion starts asynchronously without awaiting serialization at
  `src/main/ingestion/ingestionCoordinator.ts:60-64`.

Tests:

- Database rollback and queue cancellation have partial coverage, but the acceptance races and
  zero-chunk replacement are not covered.

Verification:

- Static review on 2026-10-03 established the stale-chunk and commit-window paths above.
- The existing suite passed 24 tests, but none exercise these negative cases.

Commit:

- Defects observed at `2db71a3`; no fix implemented.

## Decisions / blockers

- Canonical descendant containment and serialized generation checks are required before retrieval can
  safely consume indexed chunks.
- Successful empty/non-indexable replacements can currently retain old chunks.
- Complete format support cannot be claimed until real fixtures and packaged builds pass.
- macOS x64 compatibility is unresolved.
- The three retrospective ADRs require explicit project approval.

## Handoff

- Authorized: Update relevant task and architecture documentation from the 2026-10-03 codebase audit.
- Implemented: Recorded containment and commit-integrity defects as IDX-004 and IDX-005; corrected the
  stale completion claim; aligned security and RAG architecture requirements. No application behavior
  changed.
- Verified: Audit evidence includes a reproduced directory-symlink escape, source inspection, 24
  passing tests, passing lint/typecheck/build/project validation, and a failing repository-wide
  Prettier check documented under HARD-001.
- Remaining: IDX-001 through IDX-005.
- Risks/blockers: Out-of-root file access, stale chunks, stale-generation commits, native packaging,
  parser assets, missing fixtures, and unapproved protected decisions.
- Next action: Authorize and implement IDX-004, then IDX-005, before retrieval work.
