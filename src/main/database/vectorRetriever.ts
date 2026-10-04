import type { Database } from '@tursodatabase/database'

export interface RetrievalCandidate {
  chunkId: string
  documentId: string
  documentPath: string
  documentName: string
  watchedRoot: string
  ordinal: number
  content: string
  tokenCount: number
  startOffset: number
  endOffset: number
  heading: string | null
  sourceKind: string | null
  sourceIndex: number | null
  sourceLabel: string | null
  rank: number
  distance: number
}

export interface RetrievalRequest {
  embedding: number[]
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
  limit?: number
  watchedRoots?: string[]
  documentIds?: string[]
}

export interface Retriever {
  retrieve(request: RetrievalRequest): Promise<RetrievalCandidate[]>
}

function validateStrings(values: string[] | undefined, label: string): string[] | undefined {
  if (values === undefined) return undefined
  if (!Array.isArray(values) || values.length === 0 || values.length > 100) {
    throw new Error(`${label} must contain between 1 and 100 values.`)
  }
  const normalized = [...new Set(values)]
  if (
    normalized.some(
      (value) => typeof value !== 'string' || value.length === 0 || value.length > 4096
    )
  ) {
    throw new Error(`${label} contains an invalid value.`)
  }
  return normalized
}

function placeholders(count: number): string {
  return new Array<string>(count).fill('?').join(', ')
}

/** Performs bounded exact cosine retrieval over compatible indexed chunks. */
export class TursoVectorRetriever implements Retriever {
  constructor(private readonly database: Database) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalCandidate[]> {
    const limit = request.limit ?? 20
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Retrieval limit must be an integer between 1 and 100.')
    }
    if (
      !request.embeddingProvider ||
      !request.embeddingModel ||
      !Number.isInteger(request.embeddingDimensions) ||
      request.embeddingDimensions <= 0 ||
      request.embedding.length !== request.embeddingDimensions ||
      request.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Retrieval embedding configuration is invalid.')
    }
    const watchedRoots = validateStrings(request.watchedRoots, 'Watched-root filter')
    const documentIds = validateStrings(request.documentIds, 'Document filter')
    const conditions = [
      "d.status = 'indexed'",
      'c.embedding_provider = ?',
      'c.embedding_model = ?',
      'c.embedding_dimensions = ?'
    ]
    const parameters: unknown[] = [
      request.embeddingProvider,
      request.embeddingModel,
      request.embeddingDimensions
    ]
    if (watchedRoots) {
      conditions.push(`d.watched_root IN (${placeholders(watchedRoots.length)})`)
      parameters.push(...watchedRoots)
    }
    if (documentIds) {
      conditions.push(`d.id IN (${placeholders(documentIds.length)})`)
      parameters.push(...documentIds)
    }
    const vector = JSON.stringify(request.embedding)
    const rows = (await this.database.all(
      `SELECT
        c.id AS chunk_id, c.document_id, d.path AS document_path, d.name AS document_name,
        d.watched_root, c.ordinal, c.content, c.token_count, c.start_offset, c.end_offset,
        c.heading, c.source_kind, c.source_index, c.source_label,
        vector_distance_cos(c.embedding, vector32(?)) AS distance
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY distance ASC, c.id ASC
      LIMIT ?`,
      vector,
      ...parameters,
      limit
    )) as Array<Record<string, unknown>>

    return rows.map((row, index) => ({
      chunkId: String(row.chunk_id),
      documentId: String(row.document_id),
      documentPath: String(row.document_path),
      documentName: String(row.document_name),
      watchedRoot: String(row.watched_root),
      ordinal: Number(row.ordinal),
      content: String(row.content),
      tokenCount: Number(row.token_count),
      startOffset: Number(row.start_offset),
      endOffset: Number(row.end_offset),
      heading: row.heading === null ? null : String(row.heading),
      sourceKind: row.source_kind === null ? null : String(row.source_kind),
      sourceIndex: row.source_index === null ? null : Number(row.source_index),
      sourceLabel: row.source_label === null ? null : String(row.source_label),
      rank: index + 1,
      distance: Number(row.distance)
    }))
  }
}
