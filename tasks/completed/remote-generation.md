# Feature: User-configured remote generation

Status: Verified

## REM-001 — Allow remote OpenAI-compatible generation endpoints

Status: Verified

Authorization:

- Explicitly requested and approved by the project owner on 2026-10-04.

Acceptance criteria:

- [x] Accept bounded credential-free HTTP(S) endpoint URLs without a host allowlist.
- [x] Preserve redirect rejection, request/response bounds, cancellation, and sanitized errors.
- [x] Clearly disclose that questions and retrieved excerpts leave the device for remote endpoints.
- [x] Warn when a remote endpoint uses unencrypted HTTP.
- [x] Migrate the persisted loopback-era setting without losing user configuration.
- [x] Replace loopback/local-only naming and claims in active code, architecture, security, and user
      documentation.
- [x] Add tests for remote validation, settings migration, and privacy-warning presentation.

Architecture impact:

- Protected external-system and privacy boundary change explicitly approved by the owner.
- Approved ADR-005 supersedes the loopback-only decision in ADR-004.
- Main-process ownership, credential exclusion, redirect rejection, renderer sandboxing, and typed IPC
  boundaries remain unchanged.

Implementation:

- `validateGenerationServerSettings` in
  `src/main/ai/providers/openAiCompatibleGenerationProvider.ts:62-135` accepts arbitrary HTTP(S)
  hosts while rejecting credentials, queries, fragments, invalid protocols, and unbounded settings.
- `OpenAiCompatibleGenerationProvider` in the same file retains bounded strict-schema requests,
  citation allowlisting, redirect rejection, cancellation, timeout, and sanitized failure behavior.
- `src/main/settings.ts:5-107` uses the provider-neutral `generationServer` key and automatically
  migrates valid legacy `localGeneration` settings.
- Shared, preload, main-process, and renderer APIs use provider-neutral generation-server names while
  retaining the existing wire-level IPC channel strings.
- `generationEndpointPrivacy` in `src/renderer/src/chatPresentation.ts:12-24` classifies endpoint
  transport. `ChatPanel` in `src/renderer/src/components/ChatPanel.tsx:162-192` discloses remote
  question/evidence transfer and unencrypted HTTP.
- ADR-005, `architecture/CONTRACT.yaml`, README, RAG architecture, security guidance, release
  checklist, and active RAG task records document the approved remote boundary.

Tests:

- `src/main/ai/providers/openAiCompatibleGenerationProvider.test.ts` covers remote HTTP/HTTPS
  acceptance, unsafe URL rejection, request protections, response validation, and cancellation.
- `src/main/settings.test.ts:42-89` covers provider-neutral persistence and automatic legacy-key
  migration without losing watched folders.
- `src/renderer/src/chatPresentation.test.ts:11-17` covers endpoint privacy classification.
- `src/renderer/src/components/ChatPanel.test.tsx:14-32` verifies the visible remote-transfer and
  unencrypted-transport warning.
- `src/preload/index.test.ts` verifies the renamed typed bridge methods use the stable shared IPC
  channels.

Verification:

- `pnpm test`: 25 files and 109 tests passed.
- `pnpm lint`: passed.
- `pnpm exec prettier --check .`: passed.
- `pnpm build`: node/web type checking and all production bundles passed.
- `git diff --check`: passed.

Commit:

- Not available.
