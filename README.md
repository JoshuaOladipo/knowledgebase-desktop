# PC Agent

PC Agent is a cross-platform Electron application that watches selected folders and incrementally
indexes supported documents into a local knowledge-base database.

## Features

- Select and watch multiple folders through the native system dialog.
- Restore watched folders between application sessions.
- Receive live add, change, and removal events without duplicate watchers.
- Search file names and paths, switch between list and card views, select files, and inspect metadata.
- Keep running in the system tray after the window closes.
- Persist extracted text, Markdown, Office, OpenDocument, PDF, RTF, and EPUB chunks with
  deterministic local embeddings.
- Skip unchanged documents using content and indexing-configuration fingerprints.
- Recover the local index after restarts by reconciling it with active watched folders.
- Retrieve compatible chunks with exact cosine distance and select bounded, non-overlapping evidence.
- Persist local conversations and immutable citation snapshots until explicit deletion.
- Ask grounded questions through a user-managed loopback OpenAI-compatible generation server.
- Inspect live indexing stages, retry/re-index documents, and view/export privacy-safe local metrics.

The generation server is disabled by default. In **Local model server settings**, enter a loopback
base URL such as `http://127.0.0.1:11434/v1`, enter the server's model name, enable it, and save. The
server must implement `POST /chat/completions`; PC Agent sends no API key and rejects remote hosts,
URL credentials, query strings, fragments, and redirects.

## Architecture

- `src/main` owns native dialogs, persisted settings, the watcher lifecycle, and Electron windows.
- `src/main/database` owns the embedded Turso connection, migrations, and transactional repositories.
- `src/main/ingestion` owns file policy, extraction, chunking, deduplication, and reconciliation.
- `src/main/ai` owns provider-neutral AI contracts, the local baseline embedding provider, and the
  loopback generation adapter.
- `src/preload` exposes only the typed `PcAgentApi` bridge through context isolation.
- `src/shared/contracts.ts` defines serializable IPC requests, events, and state.
- `src/renderer` owns React presentation, file state, filtering, selection, and chat history views.

The renderer cannot access Node.js or Electron directly. It calls `window.pcAgent`; the main process validates folder paths and broadcasts serializable file and watcher events.

## Supported indexing formats

- Plain text: `.txt`
- Markdown: `.md`, `.markdown`
- Microsoft Office Open XML: `.docx`, `.pptx`, `.xlsx`
- OpenDocument: `.odt`, `.odp`, `.ods`
- PDF, RTF, and EPUB: `.pdf`, `.rtf`, `.epub`

Office-family documents are parsed locally in the Electron main process with OfficeParser. Source
metadata such as headings, pages, slides, sheet names, and chapters is retained with indexed
chunks. Files are limited to 10 MB compressed input. Archive parsing is additionally limited to
64 MB uncompressed data, 5,000 ZIP entries, and 250,000 spreadsheet cells.

Deterministic real-format fixtures cover every advertised format, including archive expansion-limit,
malformed-input, and cancellation behavior. Encrypted-document coverage remains incomplete.

OCR, attachment extraction, raw source extraction, comments, notes, headers, footers, and slide
masters are disabled. Indexed document text does not leave the machine when using the default
local embedding provider.

## Requirements

- Node.js 22
- pnpm 10.34.0

## Development

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm exec prettier --check .
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the deterministic exact-retrieval benchmark with `pnpm benchmark:retrieval`. The recorded local
10K/50K/100K results and environment are in `docs/benchmarks/retrieval-2026-10-04.md`.

`pnpm install --frozen-lockfile --offline` is also verified when the pnpm store is already populated.
The transitive `tesseract.js` install script is intentionally ignored because OCR is disabled; pnpm
reports that policy during installation.

## Packaging

Build the installer for the current platform on its native operating system:

```bash
pnpm build:linux
pnpm build:win
pnpm build:mac
```

Linux x64 unpacked packaging and a packaged Turso/OfficeParser smoke test have passed. Windows,
macOS, Linux ARM64, installers, signing/notarization, and clean-machine scenarios remain unverified.
After `pnpm build:unpack` on Linux x64, run `pnpm test:package:linux` for the native/parser smoke test.
