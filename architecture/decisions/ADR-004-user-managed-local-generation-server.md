# ADR-004: User-managed local generation server

Status: Superseded by ADR-005

## Context

PC Agent needs a concrete generation provider before chat IPC and UI can be composed. The project
owner selected a user-managed local server on 2026-10-03. Connecting to another local process is a
protected external-system dependency even though prompts remain on the user's computer.

## Decision

Use a user-configured OpenAI-compatible chat-completions endpoint restricted to HTTP or HTTPS on the
loopback interface. The Electron main process owns configuration, HTTP requests, cancellation,
timeouts, response validation, and error classification. No API key is accepted, persisted, logged,
or sent. The renderer receives only bounded endpoint/model settings and task-level chat operations.

The initial implementation is non-streaming. Streaming requires separate ordering, cancellation, and
cleanup work. Remote hosts, redirects to remote hosts, arbitrary headers, and provider SDK objects are
excluded.

## Consequences

- Users must install, configure, and run a compatible local inference server and model.
- Application installers do not bundle model weights or native inference runtimes.
- The endpoint and model are validated and retained in main-process settings.
- Questions and retrieved evidence are sent only to the configured loopback endpoint.
- Availability, authentication-like, rate-limit, timeout, malformed-response, and cancellation errors
  must be surfaced without logging prompt or source content.
- Tests use a fake local HTTP server or injected fetch implementation and require no paid/network
  service.

## Affected components

- `electron-main`, `ai`, `preload`, `shared-contracts`, `renderer`

## Related tasks

- `tasks/active/rag-retrieval-and-chat.md`
- `tasks/active/rag-security-reliability-and-future.md`
