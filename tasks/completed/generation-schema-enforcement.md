# Defect: Exact generation response schema

Status: Verified

## GSE-001 — Enforce the answer and citations schema

Status: Verified

Authorization:

- Follow-up defect reported by the user on 2026-10-04 after JSON-object mode still allowed an
  invalid response shape.

Acceptance criteria:

- [x] Require a non-empty answer field and a string-array citations field at generation time.
- [x] Preserve local parsing, size bounds, citation allowlisting, and sanitized errors.
- [x] Verify the request contract with deterministic tests and the configured llama.cpp server.

Architecture impact:

- No boundary or dependency change at implementation time; this tightened the generation request
  contract later generalized by ADR-005.

Implementation:

- `OpenAiCompatibleGenerationProvider.generate` in
  `src/main/ai/providers/openAiCompatibleGenerationProvider.ts` sends strict JSON-schema
  response formatting. The schema requires a non-empty `answer`, a string-array `citations`, and no
  additional properties.
- Existing bounded envelope parsing, local result validation, citation allowlisting, timeouts, and
  cancellation remain unchanged.
- `docs/rag-architecture.md` documents strict schema enforcement plus local validation.

Tests:

- `src/main/ai/providers/openAiCompatibleGenerationProvider.test.ts` asserts the exact structured
  request, response validation, citation filtering, bounds, cancellation, and sanitized HTTP errors.

Verification:

- Live compatibility probe: the configured llama.cpp server accepted the exact schema, including
  `minLength: 1`, and returned `{ "answer": "test", "citations": [] }` with HTTP 200.
- `pnpm test`: 25 files and 107 tests passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed for node and renderer targets.
- `pnpm exec prettier --check .`: passed.
- `pnpm build`: all production bundles passed.
- `git diff --check`: passed.

Commit:

- Not available.
