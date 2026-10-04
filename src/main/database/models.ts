export type DocumentStatus =
  'queued' | 'extracting' | 'chunking' | 'embedding' | 'indexed' | 'skipped' | 'error'

export interface DocumentRecord {
  id: string
  path: string
  name: string
  watchedRoot: string
  mimeType: string
  size: number
  modifiedAt: string
  contentHash: string | null
  configFingerprint: string | null
  status: DocumentStatus
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentWrite {
  id?: string
  path: string
  name: string
  watchedRoot: string
  mimeType: string
  size: number
  modifiedAt: string
  contentHash?: string | null
  configFingerprint?: string | null
  status: DocumentStatus
  error?: string | null
}

export interface ChunkWrite {
  id?: string
  ordinal: number
  content: string
  tokenCount: number
  startOffset: number
  endOffset: number
  heading?: string | null
  pageNumber?: number | null
  sourceKind?: string | null
  sourceIndex?: number | null
  sourceLabel?: string | null
  embedding: number[]
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
}

export interface ChunkRecord extends Omit<ChunkWrite, 'id'> {
  id: string
  documentId: string
  heading: string | null
  pageNumber: number | null
  sourceKind: string | null
  sourceIndex: number | null
  sourceLabel: string | null
  createdAt: string
}
