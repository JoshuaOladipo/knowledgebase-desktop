import type { Database, Transaction } from '@tursodatabase/database'
import { randomUUID } from 'node:crypto'
import type { GroundedCitation } from '../ai/groundedAnswerService'
import type { AnswerGrounding } from '../../shared/contracts'

export interface ConversationRecord {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MessageRecord {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: GroundedCitation[]
  grounding: AnswerGrounding | null
  createdAt: string
}

function validateText(value: string, label: string, maximum: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new Error(`${label} must contain between 1 and ${maximum} characters.`)
  }
  return normalized
}

function mapConversation(row: Record<string, unknown>): ConversationRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export class ConversationRepository {
  constructor(private readonly database: Database) {}

  async create(title: string): Promise<ConversationRecord> {
    const id = randomUUID()
    const now = new Date().toISOString()
    await this.database.run(
      'INSERT INTO conversations(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      id,
      validateText(title, 'Conversation title', 200),
      now,
      now
    )
    return (await this.get(id))!
  }

  async get(id: string): Promise<ConversationRecord | null> {
    const row = (await this.database.get('SELECT * FROM conversations WHERE id = ?', id)) as
      Record<string, unknown> | undefined
    return row ? mapConversation(row) : null
  }

  async list(): Promise<ConversationRecord[]> {
    const rows = (await this.database.all(
      'SELECT * FROM conversations ORDER BY updated_at DESC, id ASC'
    )) as Array<Record<string, unknown>>
    return rows.map(mapConversation)
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    const rows = (await this.database.all(
      `SELECT id, conversation_id, role, content, grounding, created_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC`,
      conversationId
    )) as Array<Record<string, unknown>>
    const result: MessageRecord[] = []
    for (const row of rows) {
      const citations = (await this.database.all(
        `SELECT source_id, chunk_id, document_id, document_path, document_name, heading,
                source_kind, source_index, source_label, excerpt
         FROM message_citations WHERE message_id = ? ORDER BY ordinal`,
        String(row.id)
      )) as Array<Record<string, unknown>>
      result.push({
        id: String(row.id),
        conversationId: String(row.conversation_id),
        role: String(row.role) as MessageRecord['role'],
        content: String(row.content),
        grounding:
          row.grounding === 'documents' || row.grounding === 'model' ? row.grounding : null,
        createdAt: String(row.created_at),
        citations: citations.map((citation) => ({
          sourceId: String(citation.source_id),
          chunkId: String(citation.chunk_id),
          documentId: String(citation.document_id),
          documentPath: String(citation.document_path),
          documentName: String(citation.document_name),
          heading: citation.heading === null ? null : String(citation.heading),
          sourceKind: citation.source_kind === null ? null : String(citation.source_kind),
          sourceIndex: citation.source_index === null ? null : Number(citation.source_index),
          sourceLabel: citation.source_label === null ? null : String(citation.source_label),
          excerpt: String(citation.excerpt)
        }))
      })
    }
    return result
  }

  /** Atomically persists a user question, generated answer, and immutable citation snapshots. */
  async appendExchange(
    conversationId: string,
    question: string,
    answer: string,
    citations: GroundedCitation[],
    grounding: AnswerGrounding
  ): Promise<void> {
    const userContent = validateText(question, 'Question', 10_000)
    const answerContent = validateText(answer, 'Answer', 100_000)
    const append = this.database.transactionAsync(async (transaction: Transaction) => {
      const conversation = await transaction.get(
        'SELECT id FROM conversations WHERE id = ?',
        conversationId
      )
      if (!conversation) throw new Error('Conversation does not exist.')
      const now = new Date().toISOString()
      const userMessageId = randomUUID()
      const answerMessageId = randomUUID()
      await transaction.run(
        `INSERT INTO messages(id, conversation_id, role, content, grounding, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userMessageId,
        conversationId,
        'user',
        userContent,
        null,
        now
      )
      await transaction.run(
        `INSERT INTO messages(id, conversation_id, role, content, grounding, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        answerMessageId,
        conversationId,
        'assistant',
        answerContent,
        grounding,
        now
      )
      for (const [ordinal, citation] of citations.entries()) {
        await transaction.run(
          `INSERT INTO message_citations(
            id, message_id, ordinal, source_id, chunk_id, document_id, document_path,
            document_name, heading, source_kind, source_index, source_label, excerpt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(),
          answerMessageId,
          ordinal,
          citation.sourceId,
          citation.chunkId,
          citation.documentId,
          citation.documentPath,
          citation.documentName,
          citation.heading,
          citation.sourceKind,
          citation.sourceIndex,
          citation.sourceLabel,
          citation.excerpt
        )
      }
      await transaction.run(
        'UPDATE conversations SET updated_at = ? WHERE id = ?',
        now,
        conversationId
      )
    })
    await append.immediate()
  }

  /** Explicit deletion is the retention boundary and cascades messages and evidence snapshots. */
  async delete(id: string): Promise<void> {
    await this.database.run('DELETE FROM conversations WHERE id = ?', id)
  }
}
