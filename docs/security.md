# Security and privacy constraints

## Trust model

Watched documents, filenames, extracted text, parser metadata, retrieval results, and model output are
untrusted. Only the Electron main process may hold filesystem, database, parser, native-shell, or model
provider capability.

## Required controls

- Keep `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false` in renderer windows.
- Expose task-level preload methods rather than Electron, SQL, filesystem, or provider primitives.
- Validate every IPC payload in the main process, including lengths, identifiers, limits, and paths.
- Accept privileged IPC only from the trusted application main frame and reject unexpected sender
  frames or origins.
- Deny top-level navigation away from trusted application content; open allowlisted HTTP/HTTPS links
  externally without giving remote content the preload bridge.
- Disable watcher traversal through directory symlinks. Canonicalize each file target immediately
  before privileged access and require it to remain inside an active canonical managed root.
- Reject final-component and intermediate symlinks, path swaps, and ignored paths during indexing
  under the current policy.
- Hash and extract the same bounded file snapshot so a path change cannot make the stored fingerprint
  describe different content from the indexed chunks.
- Bound file size, archive expansion, ZIP entry count, spreadsheet cells, concurrency, retries, and
  prompt context.
- Revalidate ingestion generation freshness and active-root membership in the same serialized commit
  that mutates document and chunk state. Serialize deletion so stale work cannot recreate a record.
- Treat retrieved content only as delimited evidence; it cannot change system instructions or invoke
  tools.
- Build citations from retrieval records, not model-generated source labels alone.
- Exclude source text, embeddings, raw parser data, prompts, answers, and credentials from routine
  logs and diagnostics.

## Local and cloud data

The current hash embedding provider and embedded Turso database operate locally. A future cloud
embedding or generation provider may receive questions and extracted source text. The application must
disclose that behavior before activation and store provider credentials through operating-system
credential storage. Credentials must never be stored in `settings.json`, the knowledge-base database,
renderer state, or ordinary logs.

Cloud database synchronization is not currently enabled and must not be introduced silently.

## Parser policy

OfficeParser runs only in the main process. OCR, attachment extraction, raw-content extraction,
comments, notes, headers, footers, and slide masters are disabled initially. Parser warnings and errors
must be sanitized so they do not disclose document content or raw archive/XML data. Parsers receive the
same already-bounded snapshot used for content hashing rather than reopening an untrusted path.

## Known hardening gaps

The current implementation does not yet enforce every required control above:

- Chokidar currently uses its default directory-symlink following behavior, and descendant event paths
  receive only lexical containment checks.
- Ingestion freshness is checked before, rather than inside, document replacement; deletion is not
  serialized with pending status writes and replacement commits.
- IPC handlers do not yet enforce a sender-frame/origin policy, and the application window does not
  explicitly reject top-level navigation.

Implementation and verification are tracked in `tasks/active/indexing-release-verification.md` and
`tasks/active/project-hardening.md`.

## Pending security decisions

- Whether to encrypt the local Turso database at rest.
- Key storage, recovery, and rotation if encryption is enabled.
- Whether local-only generation is required for a privacy mode.
- Whether revealing/opening a citation requires additional confirmation or extension restrictions.
- Retention and deletion policy for conversations and captured evidence.
