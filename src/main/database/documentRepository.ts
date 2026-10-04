import type { Database } from '@tursodatabase/database'
import { randomUUID } from 'node:crypto'
import type { DocumentRecord, DocumentStatus, DocumentWrite } from './models'

type DocumentRow = Record<string, unknown>

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: String(row.id),
    path: String(row.path),
    name: String(row.name),
    watchedRoot: String(row.watched_root),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    modifiedAt: String(row.modified_at),
    contentHash: row.content_hash === null ? null : String(row.content_hash),
    configFingerprint: row.config_fingerprint === null ? null : String(row.config_fingerprint),
    status: String(row.status) as DocumentStatus,
    error: row.error === null ? null : String(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class DocumentRepository {
  constructor(private readonly database: Database) {}

  async getByPath(path: string): Promise<DocumentRecord | null> {
    const row = (await this.database.get('SELECT * FROM documents WHERE path = ?', path)) as
      DocumentRow | undefined
    return row ? mapDocument(row) : null
  }

  async getById(id: string): Promise<DocumentRecord | null> {
    const row = (await this.database.get('SELECT * FROM documents WHERE id = ?', id)) as
      DocumentRow | undefined
    return row ? mapDocument(row) : null
  }

  async listWithChunkCounts(): Promise<Array<DocumentRecord & { chunkCount: number }>> {
    const rows = (await this.database.all(
      `SELECT d.*, COUNT(c.id) AS chunk_count
       FROM documents d LEFT JOIN chunks c ON c.document_id = d.id
       GROUP BY d.id ORDER BY d.path`
    )) as DocumentRow[]
    return rows.map((row) => ({ ...mapDocument(row), chunkCount: Number(row.chunk_count) }))
  }

  async countChunks(): Promise<number> {
    const row = (await this.database.get('SELECT COUNT(*) AS count FROM chunks')) as
      { count: number } | undefined
    return Number(row?.count ?? 0)
  }

  async list(): Promise<DocumentRecord[]> {
    const rows = (await this.database.all('SELECT * FROM documents ORDER BY path')) as DocumentRow[]
    return rows.map(mapDocument)
  }

  async listByRoot(watchedRoot: string): Promise<DocumentRecord[]> {
    const rows = (await this.database.all(
      'SELECT * FROM documents WHERE watched_root = ? ORDER BY path',
      watchedRoot
    )) as DocumentRow[]
    return rows.map(mapDocument)
  }

  async upsert(input: DocumentWrite): Promise<DocumentRecord> {
    const existing = await this.getByPath(input.path)
    const now = new Date().toISOString()
    const id = existing?.id ?? input.id ?? randomUUID()
    await this.database.run(
      `INSERT INTO documents(
        id, path, name, watched_root, mime_type, size, modified_at, content_hash,
        config_fingerprint, status, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        watched_root = excluded.watched_root,
        mime_type = excluded.mime_type,
        size = excluded.size,
        modified_at = excluded.modified_at,
        content_hash = excluded.content_hash,
        config_fingerprint = excluded.config_fingerprint,
        status = excluded.status,
        error = excluded.error,
        updated_at = excluded.updated_at`,
      id,
      input.path,
      input.name,
      input.watchedRoot,
      input.mimeType,
      input.size,
      input.modifiedAt,
      input.contentHash ?? null,
      input.configFingerprint ?? null,
      input.status,
      input.error ?? null,
      existing?.createdAt ?? now,
      now
    )
    return (await this.getByPath(input.path))!
  }

  async updateStatus(
    path: string,
    status: DocumentStatus,
    error: string | null = null
  ): Promise<void> {
    await this.database.run(
      'UPDATE documents SET status = ?, error = ?, updated_at = ? WHERE path = ?',
      status,
      error,
      new Date().toISOString(),
      path
    )
  }

  async deleteByPath(path: string): Promise<void> {
    await this.database.run('DELETE FROM documents WHERE path = ?', path)
  }
}
