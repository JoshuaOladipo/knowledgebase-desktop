# Release and packaging checklist

## Current packaging model

The manual `Package Check` GitHub Actions workflow runs native Linux, Windows, and macOS jobs and
uploads their artifacts. A successful workflow proves that artifacts were produced; it does not prove
that every installer, native dependency, parser asset, or runtime interaction works after installation.

macOS signing and notarization are intentionally disabled for development builds. A production release
must provide signing credentials, enable notarization, and verify the resulting artifact on a clean
machine.

## Supported-platform intent

The application uses Node's platform-aware path utilities and Electron native folder dialogs. Intended
targets are Linux, Windows, and macOS, subject to native Turso and OfficeParser verification. macOS x64
support is unresolved because the installed Turso package does not declare a Darwin x64 binary.

Do not describe native behavior as verified until the installation and runtime checks below pass on the
corresponding platform.

## Pre-release quality checks

- [ ] Install dependencies from a clean checkout with `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm exec prettier --check .`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run the complete GitHub Actions package matrix.
- [ ] Confirm the documented Node.js and pnpm versions match CI and local configuration.

## Clean-machine artifact checks

For every supported operating system:

- [ ] Install the produced artifact on a clean machine or clean VM.
- [ ] Launch the installed application and verify tray open/quit behavior.
- [ ] Select one folder and multiple folders, restart, and confirm restoration.
- [ ] Add, edit, rename, and delete files and folders while list and card views are open.
- [ ] Confirm search, selection, details, empty/loading states, and permission errors.
- [ ] Confirm only HTTP and HTTPS external links can open outside the application.
- [ ] Confirm the embedded Turso database opens and persists indexed data across restart.
- [ ] Parse representative text, Markdown, Office, OpenDocument, PDF, RTF, and EPUB fixtures.
- [ ] Confirm parser and PDF runtime assets work from the packaged ASAR layout.
- [ ] Confirm indexing cancellation and graceful shutdown leave no partial document replacement.
- [ ] Verify grounded retrieval/citations, labeled ungrounded fallback, and cancellation.
- [ ] Verify remote-generation disclosure, HTTPS operation, unencrypted-HTTP warning, and redirect
      rejection.

## Native dependency checks

- [ ] Verify Turso on Linux x64 and ARM64 targets that are distributed.
- [ ] Verify Turso on Windows x64.
- [ ] Verify Turso on macOS ARM64.
- [ ] Decide and document macOS x64 support.
- [ ] Verify whether native binaries or parser assets require explicit ASAR unpack rules.
- [ ] Re-evaluate `npmRebuild: false` against Electron ABI requirements.
- [ ] Confirm PDF parsing does not require a CDN or unavailable worker path.
- [ ] Keep OCR disabled until its offline assets, worker lifecycle, package size, and privacy behavior
      are designed and verified.

## Production publication

- [ ] Configure GitHub release publishing.
- [ ] Configure platform signing credentials without storing secrets in the repository.
- [ ] Enable and verify macOS signing and notarization.
- [ ] Verify Windows signing if production distribution requires it.
- [ ] Document checksums, supported architectures, known limitations, and rollback/recovery guidance.

## Related task records

- `tasks/active/release-readiness.md`
- `tasks/active/indexing-release-verification.md`
- `tasks/active/project-hardening.md`
