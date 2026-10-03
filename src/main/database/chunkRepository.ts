import type { Database, Transaction } from '@tursodatabase/database'
import { randomUUID } from 'node:crypto'
import type { ChunkRecord, ChunkWrite, DocumentRecord, DocumentWrite } from './models'
import { DocumentRepository } from './documentRepository'

function validateEmbedding(chunk: ChunkWrite): void {
  if (
    chunk.embedding.length !== chunk.embeddingDimensions ||
    chunk.embeddingDimensions <= 0 ||
    chunk.embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Chunk ${chunk.ordinal} has an invalid embedding dimension or value.`)
  }
}

export class ChunkRepository {
  constructor(private readonly database: Database) {}

  async listByDocument(documentId: string): Promise<ChunkRecord[]> {
    const rows = (await this.database.all(
      `SELECT
        id, document_id, ordinal, content, token_count, start_offset, end_offset,
        heading, page_number, source_kind, source_index, source_label,
        vector_extract(embedding) AS embedding,
        embedding_provider, embedding_model, embedding_dimensions, created_at
      FROM chunks WHERE document_id = ? ORDER BY ordinal`,
      documentId
    )) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id),
      documentId: String(row.document_id),
      ordinal: Number(row.ordinal),
      content: String(row.content),
      tokenCount: Number(row.token_count),
      startOffset: Number(row.start_offset),
      endOffset: Number(row.end_offset),
      heading: row.heading === null ? null : String(row.heading),
      pageNumber: row.page_number === null ? null : Number(row.page_number),
      sourceKind: row.source_kind === null ? null : String(row.source_kind),
      sourceIndex: row.source_index === null ? null : Number(row.source_index),
      sourceLabel: row.source_label === null ? null : String(row.source_label),
      embedding: JSON.parse(String(row.embedding)) as number[],
      embeddingProvider: String(row.embedding_provider),
      embeddingModel: String(row.embedding_model),
      embeddingDimensions: Number(row.embedding_dimensions),
      createdAt: String(row.created_at)
    }))
  }

  /** Atomically replaces a document and all of its chunks. */
  async replaceDocument(document: DocumentWrite, chunks: ChunkWrite[]): Promise<DocumentRecord> {
    for (const chunk of chunks) validateEmbedding(chunk)

    const replace = this.database.transactionAsync(
      async (transaction: Transaction, input: DocumentWrite, replacements: ChunkWrite[]) => {
        const existing = (await transaction.get(
          'SELECT id, created_at FROM documents WHERE path = ?',
          input.path
        )) as { id: string; created_at: string } | undefined
        const now = new Date().toISOString()
        const documentId = existing?.id ?? input.id ?? randomUUID()
        await transaction.run(
          `INSERT INTO documents(
            id, path, name, watched_root, mime_type, size, modified_at, content_hash,
            config_fingerprint, status, error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(path) DO UPDATE SET
            name = excluded.name, watched_root = excluded.watched_root,
            mime_type = excluded.mime_type, size = excluded.size,
            modified_at = excluded.modified_at, content_hash = excluded.content_hash,
            config_fingerprint = excluded.config_fingerprint, status = excluded.status,
            error = excluded.error, updated_at = excluded.updated_at`,
          documentId,
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
          existing?.created_at ?? now,
          now
        )
        await transaction.run('DELETE FROM chunks WHERE document_id = ?', documentId)
        for (const chunk of replacements) {
          await transaction.run(
            `INSERT INTO chunks(
              id, document_id, ordinal, content, token_count, start_offset, end_offset,
              heading, page_number, source_kind, source_index, source_label,
              embedding, embedding_provider, embedding_model,
              embedding_dimensions, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?, ?)`,
            chunk.id ?? randomUUID(),
            documentId,
            chunk.ordinal,
            chunk.content,
            chunk.tokenCount,
            chunk.startOffset,
            chunk.endOffset,
            chunk.heading ?? null,
            chunk.pageNumber ?? null,
            chunk.sourceKind ?? null,
            chunk.sourceIndex ?? null,
            chunk.sourceLabel ?? null,
            JSON.stringify(chunk.embedding),
            chunk.embeddingProvider,
            chunk.embeddingModel,
            chunk.embeddingDimensions,
            now
          )
        }
      }
    )
    await replace.immediate(document, chunks)
    return (await new DocumentRepository(this.database).getByPath(document.path))!
  }
}
