import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FileEntry } from '../shared/contracts'
import type { GenerationProvider } from './ai/generationProvider'
import { GroundedAnswerService } from './ai/groundedAnswerService'
import { LocalHashEmbeddingProvider } from './ai/providers/localHashEmbeddingProvider'
import { ConversationRepository } from './database/conversationRepository'
import { DatabaseService } from './database/database'
import { DocumentRepository } from './database/documentRepository'
import { TursoVectorRetriever } from './database/vectorRetriever'
import { IngestionCoordinator } from './ingestion/ingestionCoordinator'

const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
  )
})

async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'pc-agent-rag-e2e-'))
  temporaryFolders.push(folder)
  return folder
}

async function entry(path: string): Promise<FileEntry> {
  const details = await stat(path)
  return {
    path,
    name: 'knowledge.md',
    size: details.size,
    createdAt: details.birthtime.toISOString(),
    modifiedAt: details.mtime.toISOString(),
    isDirectory: false
  }
}

const generation: GenerationProvider = {
  id: 'fake-local',
  model: 'fake-local-v1',
  async generate(request) {
    return {
      text: 'The current launch phrase is grounded in the indexed file.',
      citedSourceIds: request.allowedSourceIds.slice(0, 1)
    }
  }
}

describe('local RAG journey', () => {
  it('persists indexing, retrieval, grounded citations, conversations, changes, and deletion', async () => {
    const root = await temporaryFolder()
    const state = await temporaryFolder()
    const path = join(root, 'knowledge.md')
    const databasePath = join(state, 'knowledge.db')
    const embeddings = new LocalHashEmbeddingProvider(32, 4)
    await writeFile(path, '# Launch\n\nThe current launch phrase is amber comet alpha.')

    const initialService = new DatabaseService(databasePath)
    const initialDatabase = await initialService.open()
    const initialCoordinator = new IngestionCoordinator(initialDatabase, embeddings, {
      stabilizationDelayMs: 0
    })
    initialCoordinator.setActiveRoots([root])
    initialCoordinator.handleFileEvent({ type: 'add', path, entry: await entry(path) })
    await initialCoordinator.onIdle()
    expect((await new DocumentRepository(initialDatabase).getByPath(path))?.status).toBe('indexed')
    await initialCoordinator.close()
    await initialService.close()

    const restartedService = new DatabaseService(databasePath)
    const restartedDatabase = await restartedService.open()
    const restartedCoordinator = new IngestionCoordinator(restartedDatabase, embeddings, {
      stabilizationDelayMs: 0
    })
    await restartedCoordinator.reconcile([root], [await entry(path)])
    await restartedCoordinator.onIdle()

    const answers = new GroundedAnswerService(
      embeddings,
      new TursoVectorRetriever(restartedDatabase),
      generation
    )
    const answer = await answers.answer({
      question: 'What is the current launch phrase amber comet alpha?',
      watchedRoots: [root],
      evidence: { maximumDistance: 2 }
    })
    expect(answer).toMatchObject({
      kind: 'answer',
      grounding: 'documents',
      citations: [{ documentPath: path, documentName: 'knowledge.md' }]
    })
    if (answer.kind !== 'answer') throw new Error('Expected a grounded answer.')

    const conversations = new ConversationRepository(restartedDatabase)
    const conversation = await conversations.create('Launch phrase')
    await conversations.appendExchange(
      conversation.id,
      'What is the current launch phrase?',
      answer.text,
      answer.citations,
      answer.grounding
    )

    await writeFile(path, '# Launch\n\nThe current launch phrase is violet river beta.')
    restartedCoordinator.handleFileEvent({ type: 'change', path, entry: await entry(path) })
    await restartedCoordinator.onIdle()
    const changed = await answers.answer({
      question: 'What is the current launch phrase violet river beta?',
      watchedRoots: [root],
      evidence: { maximumDistance: 2 }
    })
    expect(changed.kind).toBe('answer')
    if (changed.kind === 'answer') {
      expect(changed.citations[0].excerpt).toContain('violet river beta')
      expect(changed.citations[0].excerpt).not.toContain('amber comet alpha')
    }

    restartedCoordinator.handleFileEvent({ type: 'unlink', path })
    await restartedCoordinator.onIdle()
    await expect(
      answers.answer({
        question: 'What is the launch phrase?',
        watchedRoots: [root],
        evidence: { maximumDistance: 2 }
      })
    ).resolves.toEqual({
      kind: 'answer',
      text: 'The current launch phrase is grounded in the indexed file.',
      citations: [],
      grounding: 'model'
    })
    await restartedCoordinator.close()
    await restartedService.close()

    const finalService = new DatabaseService(databasePath)
    const finalDatabase = await finalService.open()
    const retainedMessages = await new ConversationRepository(finalDatabase).listMessages(
      conversation.id
    )
    expect(retainedMessages).toHaveLength(2)
    expect(retainedMessages[1].citations).toMatchObject([
      { documentPath: path, excerpt: expect.stringContaining('amber comet alpha') }
    ])
    await finalService.close()
  })
})
