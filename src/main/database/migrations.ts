import type { Database } from '@tursodatabase/database'

interface Migration {
  version: number
  sql: string
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        watched_root TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        modified_at TEXT NOT NULL,
        content_hash TEXT,
        config_fingerprint TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE chunks (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        heading TEXT,
        page_number INTEGER,
        embedding BLOB NOT NULL,
        embedding_provider TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        embedding_dimensions INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(document_id, ordinal)
      );

      CREATE INDEX documents_watched_root_idx ON documents(watched_root);
      CREATE INDEX documents_status_idx ON documents(status);
      CREATE INDEX chunks_document_id_idx ON chunks(document_id);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE chunks ADD COLUMN source_kind TEXT;
      ALTER TABLE chunks ADD COLUMN source_index INTEGER;
      ALTER TABLE chunks ADD COLUMN source_label TEXT;
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE message_citations (
        id TEXT PRIMARY KEY NOT NULL,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        source_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        document_path TEXT NOT NULL,
        document_name TEXT NOT NULL,
        heading TEXT,
        source_kind TEXT,
        source_index INTEGER,
        source_label TEXT,
        excerpt TEXT NOT NULL,
        UNIQUE(message_id, ordinal)
      );

      CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);
      CREATE INDEX message_citations_message_idx ON message_citations(message_id, ordinal);
    `
  },
  {
    version: 4,
    sql: `
      ALTER TABLE messages ADD COLUMN grounding TEXT CHECK(grounding IN ('documents', 'model'));
      UPDATE messages SET grounding = 'documents' WHERE role = 'assistant';
    `
  }
]

/** Applies pending schema migrations atomically and in version order. */
export async function runMigrations(database: Database): Promise<void> {
  await database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedRows = (await database.all('SELECT version FROM schema_migrations')) as Array<{
    version: number
  }>
  const applied = new Set(appliedRows.map(({ version }) => Number(version)))

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    const apply = database.transactionAsync(async (transaction) => {
      await transaction.exec(migration.sql)
      await transaction.run(
        'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)',
        migration.version,
        new Date().toISOString()
      )
    })
    await apply.immediate()
  }
}
