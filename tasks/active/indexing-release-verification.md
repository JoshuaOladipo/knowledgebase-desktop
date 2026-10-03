# Feature: Durable local document indexing

Status: Implemented — verification and architecture approval incomplete

## Feature intent

Maintain a durable local Turso knowledge base from supported files in watched folders, using bounded
and cancellable extraction, chunking, and deterministic local embeddings.

## Feature acceptance criteria

- [x] Open one embedded Turso database below Electron's user-data directory.
- [x] Apply versioned migrations and replace documents/chunks transactionally.
- [x] Reconcile watched files after restart and skip unchanged compatible content.
- [x] Support text, Markdown, DOCX, PPTX, XLSX, ODT, ODP, ODS, PDF, RTF, and EPUB policies.
- [x] Preserve generalized page/slide/sheet/chapter metadata in chunks.
- [x] Cancel stale work and prevent older generations from committing.
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
- [ ] Assert cancellation and newer-generation replacement cannot commit stale chunks.

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

## Decisions / blockers

- Complete format support cannot be claimed until real fixtures and packaged builds pass.
- macOS x64 compatibility is unresolved.
- The three retrospective ADRs require explicit project approval.

## Handoff

- Authorized: Documentation update only in this turn.
- Implemented: Existing indexing code is documented; no application behavior changed.
- Verified: Documentation formatting and agentic project validation pass; application verification
  remains incomplete.
- Remaining: IDX-001 through IDX-003.
- Risks/blockers: Native packaging, parser assets, missing fixtures, and unapproved protected decisions.
- Next action: Review ADRs, then implement IDX-001 if explicitly authorized.
