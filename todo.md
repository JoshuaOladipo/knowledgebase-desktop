# PC Agent Roadmap

## P0 — Make the core workflow functional

- [x] Replace the per-request Chokidar setup with a watcher service that owns one active watcher, reuses or replaces it safely, and closes it during application shutdown.

  Relevant code: `src/main/watcher.ts:46-154`, `src/main/index.ts:102-158`, `src/main/watcher.test.ts:40-73`

- [x] Add typed IPC methods to start, stop, and inspect the current watcher without exposing arbitrary Electron APIs to the renderer.

  Relevant code: `src/shared/contracts.ts:26-51`, `src/preload/index.ts:5-25`, `src/preload/index.d.ts:1-7`, `src/main/index.ts:79-100`

- [x] Send file `add`, `change`, and `unlink` events from the main process to the renderer.

  Relevant code: `src/main/watcher.ts:90-105`, `src/main/watcher.ts:126-147`, `src/main/index.ts:12-15`, `src/main/index.ts:106-109`, `src/preload/index.ts:11-22`

- [x] Populate renderer state from real file-system events and remove the hard-coded `FileDisplay` demo records.

  Relevant code: `src/renderer/src/App.tsx:9-40`, `src/renderer/src/fileState.ts:4-11`, `src/renderer/src/components/files_table/FilesProvider.tsx:9-44`

- [x] Prevent duplicate watcher subscriptions when React Strict Mode mounts effects twice in development.

  Relevant code: `src/main/watcher.ts:68-88`, `src/renderer/src/App.tsx:14-40`, `src/main/watcher.test.ts:40-73`

- [x] Handle inaccessible, missing, empty, and unsupported paths without crashing the application.

  Relevant code: `src/main/watcher.ts:10-31`, `src/main/watcher.ts:101-105`, `src/main/watcher.ts:126-139`, `src/renderer/src/App.tsx:43-55`, `src/renderer/src/components/FilterableFileView.tsx:11-52`

## P1 — Restore code quality gates

- [x] Define the preload API interface in `src/preload/index.d.ts` instead of declaring `window.api` as `unknown`.

  Relevant code: `src/preload/index.d.ts:1-7`, `src/shared/contracts.ts:26-41`, `src/preload/index.ts:5-25`

- [x] Add explicit Electron IPC event and handler types in the watcher implementation.

  Relevant code: `src/shared/contracts.ts:1-51`, `src/main/watcher.ts:5-8`, `src/main/index.ts:79-100`, `src/preload/index.ts:11-22`

- [x] Replace `any[]` in the file context with the appropriate file display model and type all provider and hook return values.

  Relevant code: `src/shared/contracts.ts:1-8`, `src/renderer/src/components/files_table/filesContext.ts:4-18`, `src/renderer/src/components/files_table/FilesProvider.tsx:9-44`, `src/renderer/src/components/files_table/useFiles.ts:6-10`

- [x] Type the `TableSwitcher` props with TypeScript and remove the unnecessary runtime `prop-types` dependency.

  Relevant code: `src/renderer/src/components/files_table/TableSwitcher.tsx:3-34`, `src/renderer/src/viewState.ts:1-6`, `package.json:28-56`

- [x] Remove unused imports and variables, including `managed_folder` and the unused `useState` import.

  Relevant code: `src/renderer/src/App.tsx:1-153`, `src/renderer/src/components/files_table/SearchBox.tsx:1-20`, `eslint.config.mjs:7-31`

- [x] Update the Node TypeScript module resolution so `@tailwindcss/vite` type declarations resolve correctly.

  Relevant code: `tsconfig.node.json:1-9`, `tsconfig.web.json:1-20`, `electron.vite.config.ts:1-25`

- [x] Run `pnpm format`, then ensure `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass.

  Relevant code: `package.json:12-26`, `eslint.config.mjs:7-31`, `tsconfig.node.json:1-9`, `tsconfig.web.json:1-20`, `.github/workflows/ci.yml:19-24`

## P1 — Make folder selection portable

- [x] Replace `/home/joshua/Downloads` with an Electron folder-selection dialog.

  Relevant code: `src/main/index.ts:79-87`, `src/preload/index.ts:5-7`, `src/renderer/src/App.tsx:43-55`

- [x] Display the active watched folders and allow users to add, remove, and stop watching them.

  Relevant code: `src/renderer/src/App.tsx:43-71`, `src/renderer/src/App.tsx:73-143`, `src/shared/contracts.ts:26-36`

- [x] Decide whether watched folders persist between sessions and implement the selected behavior.
  Decision: watched folders are persisted
  Relevant code: `src/main/index.ts:17-39`, `src/main/index.ts:88-96`, `src/main/index.ts:118-129`

- [x] Normalize paths and verify behavior on Linux, macOS, and Windows.

  Relevant code: `src/main/watcher.ts:10-31`, `src/main/watcher.test.ts:21-29`, `.github/workflows/package-check.yml:8-18`, `README.md:56-68`

## P1 — Harden Electron security

- [-] Allow `shell.openExternal` only for explicitly approved `http:` and `https:` URLs.
  Todo-Investigate further
  Relevant code: `src/main/index.ts:60-68`, `README.md:56-64`

- [x] Validate all folder arguments in the main process before passing them to Chokidar.

  Relevant code: `src/main/watcher.ts:10-31`, `src/main/watcher.ts:68-70`, `src/main/watcher.test.ts:21-29`

- [x] Keep context isolation enabled and evaluate whether the preload sandbox can be enabled.

  Relevant code: `src/main/index.ts:41-57`, `src/preload/index.ts:1-25`, `src/preload/index.d.ts:1-7`

- [x] Remove the unused `ping` IPC listener and expose only APIs required by the application.

  Relevant code: `src/main/index.ts:79-100`, `src/shared/contracts.ts:26-51`, `src/preload/index.ts:5-25`, `src/preload/index.test.ts:14-33`

## P2 — Complete the interface

- [x] Connect the search field to file state and support case-insensitive filtering.

  Relevant code: `src/renderer/src/components/files_table/SearchBox.tsx:3-18`, `src/renderer/src/components/files_table/FilesProvider.tsx:9-15`, `src/renderer/src/fileState.ts:14-20`, `src/renderer/src/fileState.test.ts:25-29`

- [x] Replace placeholder table columns and card content with actual file metadata.

  Relevant code: `src/shared/contracts.ts:1-8`, `src/main/watcher.ts:33-44`, `src/renderer/src/components/files_table/RowTable.tsx:5-70`, `src/renderer/src/components/files_table/CardTable.tsx:5-52`

- [x] Implement file selection, select-all behavior, and the details action.

  Relevant code: `src/renderer/src/components/files_table/FilesProvider.tsx:9-44`, `src/renderer/src/components/files_table/RowTable.tsx:5-70`, `src/renderer/src/components/files_table/CardTable.tsx:5-52`, `src/renderer/src/components/FilterableFileView.tsx:54-85`

- [x] Add loading, empty, permission-error, and watcher-error states.

  Relevant code: `src/shared/contracts.ts:18-24`, `src/main/watcher.ts:96-105`, `src/renderer/src/App.tsx:73-143`, `src/renderer/src/components/FilterableFileView.tsx:31-52`

- [x] Add accessible labels, keyboard interaction, and active-state feedback to view controls.

  Relevant code: `src/renderer/src/components/files_table/TableSwitcher.tsx:9-32`, `src/renderer/src/components/files_table/SearchBox.tsx:4-18`, `src/renderer/src/components/files_table/RowTable.tsx:12-65`, `src/renderer/src/components/FilterableFileView.tsx:54-85`

## P2 — Add automated verification

- [x] Add unit tests for watcher lifecycle, path validation, and file-event conversion.

  Relevant code: `src/main/watcher.test.ts:1-74`, `src/main/watcher.ts:10-154`

- [x] Add renderer tests for filtering, view switching, and file-event state updates.

  Relevant code: `src/renderer/src/fileState.test.ts:1-36`, `src/renderer/src/fileState.ts:1-36`, `src/renderer/src/viewState.ts:1-6`

- [x] Add an integration test covering the typed preload/main IPC contract.
  
  Todo - investigate further
  Relevant code: `src/preload/index.test.ts:1-34`, `src/preload/index.ts:1-25`, `src/shared/contracts.ts:26-51`, `src/main/index.ts:79-100`

- [x] Add CI checks for formatting, linting, type checking, tests, and production builds.

  Relevant code: `.github/workflows/ci.yml:1-24`, `package.json:12-26`

## P3 — Prepare for distribution

- [x] Replace template package metadata, application IDs, maintainer details, homepage, and update URL.

  Relevant code: `package.json:1-11`, `electron-builder.yml:1-4`, `electron-builder.yml:14-20`, `electron-builder.yml:29-42`, `src/main/index.ts:102-104`

- [-] Review requested macOS permissions and remove camera or microphone declarations if unused.
  Todo-investigate further
  Relevant code: `electron-builder.yml:21-26`, `build/entitlements.mac.plist:1-12`

- [-] Document the architecture, IPC contract, supported platforms, setup, testing, and packaging workflow in `README.md`.

  Todo-improve documentation

- [x] Verify packaged Linux, Windows, and macOS applications against a release checklist.

  Relevant code: `.github/workflows/package-check.yml:1-35`, `package.json:21-26`, `electron-builder.yml:14-42`, `README.md:44-68`
