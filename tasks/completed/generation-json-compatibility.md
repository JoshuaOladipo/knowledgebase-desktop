# Defect: Local generation JSON compatibility

Status: Verified

## GJC-001 — Enforce structured output and classify invalid responses

Status: Verified

Authorization:

- Explicitly requested by the user on 2026-10-04 after reproducing an `unavailable` generation
  failure against the configured llama.cpp server.

Acceptance criteria:

- [x] Request JSON-object output from the OpenAI-compatible chat-completions endpoint.
- [x] Preserve the bounded local response validation and citation allowlist.
- [x] Distinguish malformed/invalid provider responses from server availability failures.
- [x] Add deterministic regression tests and update relevant documentation.

Architecture impact:

- No boundary or dependency change; this hardens the existing approved local generation provider.

Implementation:

- `LocalServerGenerationProvider` in
  `src/main/ai/providers/localServerGenerationProvider.ts:12-60,139-175,191-246` requests
  `response_format: { type: 'json_object' }`, preserves bounded parsing and citation filtering, and
  marks malformed, missing, invalid, or oversized responses as invalid provider output.
- `classifyGenerationError` in `src/main/ai/generationProvider.ts:18-53` exposes the sanitized
  `invalid-response` category and classifies fetch-level `TypeError` failures as unavailable.
- `docs/rag-architecture.md` records enforced structured output and the error distinction.

Tests:

- `src/main/ai/providers/localServerGenerationProvider.test.ts:34-125` verifies JSON mode is sent,
  citations remain allowlisted, malformed output is rejected, response bounds remain enforced, and
  cancellation still works.
- `src/main/ai/groundedAnswerService.test.ts:129-160` verifies sanitized unavailable and
  invalid-response classification without leaking provider error content.

Verification:

- Live compatibility probe: the configured llama.cpp server accepted
  `response_format: { "type": "json_object" }` and returned a valid answer/citations object.
- `pnpm test`: 25 files and 107 tests passed.
- `pnpm lint`: passed.
- `pnpm exec prettier --check .`: passed.
- `pnpm build`: node/web type checking and all production bundles passed.
- `git diff --check`: passed.

Commit:

- Not available.
