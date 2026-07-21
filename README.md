# PC Agent

PC Agent is a cross-platform Electron application which watches specified folders and ingests files in real-time local RAG

## Features

- Select and watch multiple folders through the native system dialog.
- Restore watched folders between application sessions.
- Receive live add, change, and removal events without duplicate watchers.
- Search file names and paths, switch between list and card views, select files, and inspect metadata.
- Keep running in the system tray after the window closes.

## Architecture

- `src/main` owns native dialogs, persisted settings, the watcher lifecycle, and Electron windows.
- `src/preload` exposes only the typed `PcAgentApi` bridge through context isolation.
- `src/shared/contracts.ts` defines serializable IPC requests, events, and state.
- `src/renderer` owns React presentation, file state, filtering, and selection.

The renderer cannot access Node.js or Electron directly. It calls `window.pcAgent`; the main process validates folder paths and broadcasts serializable file and watcher events.

## Requirements

- Node.js 22
- pnpm 10

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
