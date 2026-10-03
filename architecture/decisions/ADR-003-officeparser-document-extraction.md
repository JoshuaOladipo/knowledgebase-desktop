# ADR-003: OfficeParser for structured document extraction

Status: Proposed — retrospective approval required

## Context

The knowledge base needs local extraction for DOCX, PPTX, XLSX, OpenDocument, PDF, RTF, and EPUB
while retaining citation metadata. The repository pins `officeparser` 7.5.0 and wraps it behind the
ingestion extractor contract. This external dependency is a protected decision.

## Decision / proposal

Use the pinned OfficeParser package only in the main process. Wrap it in an application-owned,
asynchronous adapter with cancellation, archive limits, sanitized warnings, and generalized source
metadata. Keep OCR, attachments, raw content, comments, notes, headers, footers, and slide masters
disabled initially. Hash and parse the same bounded byte snapshot instead of reopening the source path
after policy validation.

## Alternatives considered

- Format-specific parsers provide tighter control but substantially increase maintenance.
- Cloud extraction conflicts with default local-first privacy expectations.
- Text-and-Markdown-only support is insufficient for the intended knowledge base.

## Consequences

- Resource limits and cancellation are security requirements.
- Snapshot-based parsing is required to prevent path-swap and fingerprint/content inconsistencies.
- Real-format fixtures and packaged application verification are required before complete support is
  claimed.
- Parser configuration forms part of the ingestion fingerprint.
- OCR remains out of scope pending a separate design.

## Affected components

- `ingestion`
- `database`
- `electron-main`
- Packaging configuration

## Related tasks

- `tasks/active/indexing-release-verification.md`
