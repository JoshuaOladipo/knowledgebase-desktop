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

Question answering and retrieval UI are planned next; the current release builds and maintains the
local index but does not yet expose a chat experience.

## Architecture

- `src/main` owns native dialogs, persisted settings, the watcher lifecycle, and Electron windows.
- `src/main/database` owns the embedded Turso connection, migrations, and transactional repositories.
- `src/main/ingestion` owns file policy, extraction, chunking, deduplication, and reconciliation.
- `src/main/ai` owns the provider-independent embedding contract and local baseline provider.
- `src/preload` exposes only the typed `PcAgentApi` bridge through context isolation.
- `src/shared/contracts.ts` defines serializable IPC requests, events, and state.
- `src/renderer` owns React presentation, file state, filtering, and selection.

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

## Packaging

Build the installer for the current platform on its native operating system:

```bash
pnpm build:linux
pnpm build:win
pnpm build:mac
```
