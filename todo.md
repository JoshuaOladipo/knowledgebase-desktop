# PC Agent Roadmap

## P0 — Make the core workflow functional

- [ ] Replace the per-request Chokidar setup with a watcher service that owns one active watcher, reuses or replaces it safely, and closes it during application shutdown.
- [ ] Add typed IPC methods to start, stop, and inspect the current watcher without exposing arbitrary Electron APIs to the renderer.
- [ ] Send file `add`, `change`, and `unlink` events from the main process to the renderer.
- [ ] Populate renderer state from real file-system events and remove the hard-coded `FileDisplay` demo records.
- [ ] Prevent duplicate watcher subscriptions when React Strict Mode mounts effects twice in development.
- [ ] Handle inaccessible, missing, empty, and unsupported paths without crashing the application.

## P1 — Restore code quality gates

- [ ] Define the preload API interface in `src/preload/index.d.ts` instead of declaring `window.api` as `unknown`.
- [ ] Add explicit Electron IPC event and handler types in the watcher implementation.
- [ ] Replace `any[]` in the file context with the appropriate file display model and type all provider and hook return values.
- [ ] Type the `TableSwitcher` props with TypeScript and remove the unnecessary runtime `prop-types` dependency.
- [ ] Remove unused imports and variables, including `managed_folder` and the unused `useState` import.
- [ ] Update the Node TypeScript module resolution so `@tailwindcss/vite` type declarations resolve correctly.
- [ ] Run `pnpm format`, then ensure `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass.

## P1 — Make folder selection portable

- [ ] Replace `/home/joshua/Downloads` with an Electron folder-selection dialog.
- [ ] Display the active watched folders and allow users to add, remove, and stop watching them.
- [ ] Decide whether watched folders persist between sessions and implement the selected behavior.
- [ ] Normalize paths and verify behavior on Linux, macOS, and Windows.

## P1 — Harden Electron security

- [ ] Allow `shell.openExternal` only for explicitly approved `http:` and `https:` URLs.
- [ ] Validate all folder arguments in the main process before passing them to Chokidar.
- [ ] Keep context isolation enabled and evaluate whether the preload sandbox can be enabled.
- [ ] Remove the unused `ping` IPC listener and expose only APIs required by the application.

## P2 — Complete the interface

- [ ] Connect the search field to file state and support case-insensitive filtering.
- [ ] Replace placeholder table columns and card content with actual file metadata.
- [ ] Implement file selection, select-all behavior, and the details action.
- [ ] Add loading, empty, permission-error, and watcher-error states.
- [ ] Add accessible labels, keyboard interaction, and active-state feedback to view controls.

## P2 — Add automated verification

- [ ] Add unit tests for watcher lifecycle, path validation, and file-event conversion.
- [ ] Add renderer tests for filtering, view switching, and file-event state updates.
- [ ] Add an integration test covering the typed preload/main IPC contract.
- [ ] Add CI checks for formatting, linting, type checking, tests, and production builds.

## P3 — Prepare for distribution

- [ ] Replace template package metadata, application IDs, maintainer details, homepage, and update URL.
- [ ] Review requested macOS permissions and remove camera or microphone declarations if unused.
- [ ] Document the architecture, IPC contract, supported platforms, setup, testing, and packaging workflow in `README.md`.
- [ ] Verify packaged Linux, Windows, and macOS applications against a release checklist.
