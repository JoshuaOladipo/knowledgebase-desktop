import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { GroundedCitation } from '../ai/groundedAnswerService'
import { ConversationRepository } from './conversationRepository'
import { DatabaseService } from './database'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

const citation: GroundedCitation = {
  sourceId: 'chunk-1',
  chunkId: 'chunk-1',
  documentId: 'document-1',
  documentPath: '/documents/source.md',
  documentName: 'source.md',
  heading: 'Facts',
  sourceKind: 'section',
  sourceIndex: 1,
  sourceLabel: 'Facts',
  excerpt: 'Immutable evidence snapshot.'
}

describe('ConversationRepository', () => {
  it('persists conversations, exchanges, and evidence snapshots across restart', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-conversation-'))
    temporaryFolders.push(folder)
    const path = join(folder, 'knowledge.db')
    const service = new DatabaseService(path)
    const repository = new ConversationRepository(await service.open())
    const conversation = await repository.create('Grounded discussion')
    await repository.appendExchange(
      conversation.id,
      'What is preserved?',
      'The evidence snapshot.',
      [citation],
      'documents'
    )
    await service.close()

    const reopened = new DatabaseService(path)
    const persisted = new ConversationRepository(await reopened.open())
    expect(await persisted.list()).toEqual([expect.objectContaining({ id: conversation.id })])
    expect(await persisted.listMessages(conversation.id)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'What is preserved?',
        citations: [],
        grounding: null
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'The evidence snapshot.',
        grounding: 'documents',
        citations: [citation]
      })
    ])
    await reopened.close()
  })

  it('rolls back an answer and its messages when citation persistence fails', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-conversation-rollback-'))
    temporaryFolders.push(folder)
    const service = new DatabaseService(join(folder, 'knowledge.db'))
    const database = await service.open()
    const repository = new ConversationRepository(database)
    const conversation = await repository.create('Rollback')
    await database.exec(`
      CREATE TRIGGER fail_citation BEFORE INSERT ON message_citations
      BEGIN SELECT RAISE(ABORT, 'citation failure'); END;
    `)
    await expect(
      repository.appendExchange(conversation.id, 'Question', 'Answer', [citation], 'documents')
    ).rejects.toThrow()
    expect(await repository.listMessages(conversation.id)).toEqual([])
    await service.close()
  })

  it('deletes conversations with all messages and citation snapshots', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-conversation-delete-'))
    temporaryFolders.push(folder)
    const service = new DatabaseService(join(folder, 'knowledge.db'))
    const database = await service.open()
    const repository = new ConversationRepository(database)
    const conversation = await repository.create('Delete me')
    await repository.appendExchange(conversation.id, 'Question', 'Answer', [citation], 'documents')
    await repository.delete(conversation.id)
    expect(await repository.get(conversation.id)).toBeNull()
    expect(await database.get('SELECT count(*) AS count FROM messages')).toEqual({ count: 0 })
    expect(await database.get('SELECT count(*) AS count FROM message_citations')).toEqual({
      count: 0
    })
    await service.close()
  })

  it('persists model grounding without citations', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'pc-agent-conversation-model-'))
    temporaryFolders.push(folder)
    const service = new DatabaseService(join(folder, 'knowledge.db'))
    const repository = new ConversationRepository(await service.open())
    const conversation = await repository.create('General knowledge')
    await repository.appendExchange(
      conversation.id,
      'Unknown in my files?',
      'A model-knowledge answer.',
      [],
      'model'
    )
    expect(await repository.listMessages(conversation.id)).toEqual([
      expect.objectContaining({ role: 'user', grounding: null }),
      expect.objectContaining({ role: 'assistant', grounding: 'model', citations: [] })
    ])
    await service.close()
  })
})
