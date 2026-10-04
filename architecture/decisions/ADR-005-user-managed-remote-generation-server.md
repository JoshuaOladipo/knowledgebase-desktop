# ADR-005: User-managed remote generation server

Status: Approved

## Context

PC Agent initially restricted generation to a user-managed loopback server under ADR-004. The project
owner explicitly approved remote generation endpoints on 2026-10-04. Remote generation can transmit
questions and retrieved document excerpts beyond the user's device and therefore changes the external
system and privacy boundary.

## Decision

Allow a user-configured OpenAI-compatible HTTP(S) chat-completions base URL without a hostname
allowlist. The feature remains disabled by default and requires the user to enter, enable, and save an
endpoint. The UI must disclose that remote endpoints receive questions and selected document excerpts
and must additionally warn that remote HTTP transport is unencrypted.

The Electron main process continues to own validation, network requests, cancellation, timeouts,
structured response enforcement, and error classification. Endpoint URLs may not contain credentials,
query strings, or fragments. Redirects, arbitrary headers, API credentials, and provider SDK objects
remain excluded. Responses remain bounded and validated before crossing IPC.

## Consequences

- A configured server may be operated locally, on a private network, or on the public internet.
- HTTPS is strongly recommended for every non-loopback endpoint; HTTP remote endpoints are permitted
  for user-managed private-network deployments with an explicit visible warning.
- Questions and selected retrieved excerpts may leave the device. The remote operator's retention,
  training, access-control, and jurisdiction policies are outside PC Agent's control.
- No API key or other credential is accepted, persisted, logged, or sent, so authenticated providers
  remain unsupported.
- Redirect rejection prevents a configured endpoint from silently changing the destination.
- Application installers still do not bundle model weights or inference runtimes.

## Affected components

- `electron-main`, `ai`, `preload`, `shared-contracts`, `renderer`, documentation

## Supersedes

- ADR-004: User-managed local generation server

## Related tasks

- `tasks/completed/remote-generation.md`
- `tasks/active/rag-retrieval-and-chat.md`
- `tasks/active/rag-security-reliability-and-future.md`
