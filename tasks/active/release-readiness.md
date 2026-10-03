# Feature: Cross-platform release readiness

Status: Planning

## Feature intent

Turn produced development artifacts into verified, installable releases with explicit platform,
architecture, signing, native dependency, and runtime evidence.

## Feature acceptance criteria

- [ ] Complete the canonical checklist in `docs/release-checklist.md` for every supported target.
- [ ] Verify installed artifacts on clean machines or VMs.
- [ ] Verify Turso and OfficeParser from packaged runtime layouts.
- [ ] Resolve macOS x64 support and all production signing/notarization requirements.
- [ ] Configure publishing without committing release credentials.

## Architecture assessment

- Affected components: packaging, `electron-main`, `database`, `ingestion`
- Protected decision required: Conditional if platform support changes data ownership or introduces a
  new release/update service.
- ADR: None currently; reference ADR-001 and ADR-003 for native database/parser consequences.

## Tasks

### REL-001 — Run the native package matrix and install artifacts

Status: Pending

Purpose:
Prove that build success translates into installable applications.

Dependencies:

- HARD-001 quality suite.
- IDX-001 format fixtures.

Acceptance criteria:

- [ ] Run Linux, Windows, and macOS package jobs.
- [ ] Upload and retain artifacts for manual verification.
- [ ] Install each artifact on a clean system.
- [ ] Record exact OS, architecture, artifact, and outcome.

Expected verification:

- GitHub package-check workflow and clean-machine evidence.

Architecture impact:

- None.

Implementation:

- Workflow exists; clean-machine installation evidence is pending.

Tests:

- Pending.

Verification:

- Not run for this transition.

Commit:

- Not available.

### REL-002 — Execute application release scenarios

Status: Pending

Purpose:
Verify native and user-visible behavior in installed applications.

Dependencies:

- REL-001

Acceptance criteria:

- [ ] Verify single/multiple folder selection and restart restoration.
- [ ] Verify add/edit/rename/delete events in list and card views.
- [ ] Verify search, selection, details, tray, empty/loading states, and permission errors.
- [ ] Verify only HTTP/HTTPS external links open externally.
- [ ] Verify durable indexing, all enabled formats, cancellation, and graceful shutdown.
- [ ] Verify retrieval/chat/citations when those features ship.

Expected verification:

- Completed checklist with platform-specific observations and issues.

Architecture impact:

- None.

Implementation:

- Not verified across installed targets.

Tests:

- Manual release checks plus available automation.

Verification:

- Pending.

Commit:

- Not available.

### REL-003 — Resolve native module and asset packaging

Status: Pending

Purpose:
Ensure Turso binaries and OfficeParser/PDF assets load from packaged applications.

Dependencies:

- REL-001

Acceptance criteria:

- [ ] Verify Linux x64/ARM64, Windows x64, and macOS ARM64 native loading.
- [ ] Decide macOS x64 support.
- [ ] Resolve ASAR unpack requirements.
- [ ] Re-evaluate `npmRebuild: false` and Electron ABI compatibility.
- [ ] Confirm PDF parsing requires no unavailable CDN/worker resource.
- [ ] Keep OCR disabled until separately designed and verified.

Expected verification:

- Packaged extraction/database smoke tests on each supported target.

Architecture impact:

- Must remain within ADR-001 and ADR-003 unless a new decision is approved.

Implementation:

- Not fully verified.

Tests:

- Pending.

Verification:

- Pending.

Commit:

- Not available.

### REL-004 — Configure production signing, notarization, and publishing

Status: Pending

Purpose:
Prepare trustworthy public release artifacts.

Dependencies:

- REL-001 through REL-003.

Acceptance criteria:

- [ ] Configure GitHub release publishing.
- [ ] Configure credentials outside the repository.
- [ ] Enable and verify macOS signing and notarization.
- [ ] Decide and verify Windows signing requirements.
- [ ] Publish checksums, supported architectures, known limitations, and recovery guidance.

Expected verification:

- Signed/notarized artifact validation and a release dry run.

Architecture impact:

- A new update or release service is a protected external dependency.

Implementation:

- Development macOS builds intentionally remain unsigned and unnotarized.

Tests:

- Pending.

Verification:

- Pending.

Commit:

- Not available.

## Decisions / blockers

- macOS x64 support is unresolved.
- Production signing/notarization credentials are not configured.
- RAG release scenarios depend on unfinished retrieval/chat work.

## Handoff

- Authorized: Documentation migration only.
- Implemented: Release checklist and durable release tasks.
- Verified: No platform verification claimed.
- Remaining: REL-001 through REL-004.
- Risks/blockers: Native binaries, ASAR assets, signing credentials, clean-machine access.
- Next action: Complete HARD-001 and IDX-001, then authorize REL-001.
