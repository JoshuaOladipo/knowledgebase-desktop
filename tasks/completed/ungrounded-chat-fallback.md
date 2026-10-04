# Feature: Ungrounded chat fallback

Status: Verified

## UCF-001 — Generate and label an answer when indexed evidence is unavailable

Status: Verified

Purpose:
Allow the configured local model to answer from general model knowledge when retrieval produces no
usable evidence, while making the lack of document grounding explicit and durable in conversation
history.

Authorization:

- Explicitly requested by the user on 2026-10-04.

Acceptance criteria:

- [x] Invoke generation when evidence selection returns no candidates, below relevance, or budget
      exhaustion.
- [x] Keep evidence-backed answers constrained to retrieved evidence and citations.
- [x] Return an explicit grounding classification through shared IPC contracts.
- [x] Persist the grounding classification and preserve it after conversation reload.
- [x] Clearly label model-knowledge answers as ungrounded in the chat UI.
- [x] Cover orchestration, persistence, IPC mapping, and renderer presentation with tests.

Architecture impact:

- Uses the existing `ai`, `database`, `electron-main`, `shared-contracts`, and `renderer` boundaries.
- Uses the already approved user-managed local generation server; no new external dependency or
  protected architecture decision is introduced.

Implementation:

- `GroundedAnswerService` in `src/main/ai/groundedAnswerService.ts:34-134` distinguishes document and
  model grounding, sends citation-free fallback prompts when evidence selection yields no usable
  chunks, and preserves the evidence-only prompt for grounded answers.
- Shared grounding contracts are defined in `src/shared/contracts.ts:44-63` and mapped through chat
  IPC in `src/main/chatIpc.ts:127-152,171-190`.
- Migration 4 in `src/main/database/migrations.ts:98-104` adds durable grounding metadata and
  classifies legacy assistant history as document-grounded. `ConversationRepository` in
  `src/main/database/conversationRepository.ts:69-175` reads and atomically persists that metadata.
- `messageForAnswer` in `src/renderer/src/chatPresentation.ts:24-38` carries grounding into renderer
  messages. `ChatPanel` in `src/renderer/src/components/ChatPanel.tsx:294-318` visibly warns when an
  answer uses general model knowledge.
- `docs/rag-architecture.md`, `docs/release-checklist.md`, and
  `tasks/active/rag-retrieval-and-chat.md` document the revised behavior.

Tests:

- `src/main/ai/groundedAnswerService.test.ts:37-109` covers grounded citation enforcement and all
  three insufficient-evidence fallback paths.
- `src/main/database/conversationRepository.test.ts:30-120` covers restart persistence, atomicity,
  deletion, and model-grounding retention.
- `src/main/database/database.test.ts` verifies migration 4 backfills legacy assistant messages as
  document-grounded while leaving user messages unclassified.
- `src/main/chatIpc.test.ts:43-118` covers grounding through IPC and reloaded history.
- `src/renderer/src/chatPresentation.test.ts:22-68` covers message mapping for grounded, model, and
  insufficient-context results.
- `src/renderer/src/components/ChatPanel.test.tsx:14-48` verifies the visible ungrounded warning.
- `src/main/ragE2e.test.ts` covers the model fallback after indexed source deletion.

Verification:

- `pnpm test`: 25 files and 105 tests passed.
- `pnpm lint`: passed.
- `pnpm exec prettier --check .`: passed.
- `pnpm build`: node/web type checking and all production bundles passed.
- `git diff --check`: passed.

Commit:

- Not available.
