import type { Database } from '@tursodatabase/database'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type {
  AskQuestionRequest,
  AskQuestionResult,
  ChatCitation,
  ConversationDetails,
  GenerationServerSettings
} from '../shared/contracts'
import { ipcChannels } from '../shared/contracts'
import type { EmbeddingProvider } from './ai/embeddingProvider'
import {
  GroundedAnswerService,
  type GroundedAnswer,
  type GroundedAnswerRequest,
  type GroundedCitation
} from './ai/groundedAnswerService'
import { OpenAiCompatibleGenerationProvider } from './ai/providers/openAiCompatibleGenerationProvider'
import { ConversationRepository } from './database/conversationRepository'
import { TursoVectorRetriever } from './database/vectorRetriever'
import { assertTrustedSender } from './ipc'
import type { OperationMetricRecorder } from './ai/operationMetrics'

export interface ChatIpcDependencies {
  database: Database
  embeddings: EmbeddingProvider
  trustedRendererUrl: string
  watchedRoots: () => string[]
  loadGenerationSettings: () => Promise<GenerationServerSettings>
  saveGenerationSettings: (settings: GenerationServerSettings) => Promise<GenerationServerSettings>
  metrics?: OperationMetricRecorder
  createAnswerService?: (settings: GenerationServerSettings) => {
    answer(request: GroundedAnswerRequest): Promise<GroundedAnswer>
  }
}

function validateIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new Error(`${label} must be a non-empty string of at most 200 characters.`)
  }
  return value
}

export function validateAskQuestionRequest(value: unknown): AskQuestionRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Question request must be an object.')
  }
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some((key) => !['requestId', 'conversationId', 'question'].includes(key))
  ) {
    throw new Error('Question request contains an unknown field.')
  }
  const requestId = validateIdentifier(input.requestId, 'Request ID')
  if (
    typeof input.question !== 'string' ||
    input.question.trim().length === 0 ||
    input.question.length > 10_000
  ) {
    throw new Error('Question must contain between 1 and 10,000 characters.')
  }
  const conversationId =
    input.conversationId === undefined
      ? undefined
      : validateIdentifier(input.conversationId, 'Conversation ID')
  return { requestId, conversationId, question: input.question.trim() }
}

function publicCitation(citation: GroundedCitation): ChatCitation {
  return {
    sourceId: citation.sourceId,
    documentPath: citation.documentPath,
    documentName: citation.documentName,
    heading: citation.heading,
    sourceLabel: citation.sourceLabel,
    excerpt: citation.excerpt
  }
}

/** Registers generation settings, grounded chat, cancellation, and conversation history IPC. */
export function registerChatIpcHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  dependencies: ChatIpcDependencies
): void {
  const conversations = new ConversationRepository(dependencies.database)
  const retriever = new TursoVectorRetriever(dependencies.database)
  const activeRequests = new Map<string, AbortController>()
  const trusted = (event: IpcMainInvokeEvent): void =>
    assertTrustedSender(event, dependencies.trustedRendererUrl)

  ipc.handle(ipcChannels.getGenerationServerSettings, async (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Generation settings do not accept arguments.')
    return dependencies.loadGenerationSettings()
  })

  ipc.handle(ipcChannels.updateGenerationServerSettings, async (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Generation settings update requires one object.')
    return dependencies.saveGenerationSettings(args[0] as GenerationServerSettings)
  })

  ipc.handle(ipcChannels.askQuestion, async (event, ...args): Promise<AskQuestionResult> => {
    trusted(event)
    if (args.length !== 1) throw new Error('Chat ask requires one request object.')
    const request = validateAskQuestionRequest(args[0])
    if (activeRequests.has(request.requestId)) throw new Error('Request ID is already active.')
    if (request.conversationId && !(await conversations.get(request.conversationId))) {
      throw new Error('Conversation does not exist.')
    }
    const settings = await dependencies.loadGenerationSettings()
    if (!settings.enabled) throw new Error('Enable the generation server in Settings first.')
    const controller = new AbortController()
    activeRequests.set(request.requestId, controller)
    try {
      const service = dependencies.createAnswerService
        ? dependencies.createAnswerService(settings)
        : new GroundedAnswerService(
            dependencies.embeddings,
            retriever,
            new OpenAiCompatibleGenerationProvider(settings),
            dependencies.metrics
          )
      const watchedRoots = dependencies.watchedRoots()
      if (watchedRoots.length === 0)
        throw new Error('Add a watched folder before asking a question.')
      const answer = await service.answer({
        question: request.question,
        watchedRoots,
        signal: controller.signal
      })
      if (answer.kind === 'insufficient-context') {
        return { conversationId: request.conversationId, answer }
      }
      const conversation = request.conversationId
        ? (await conversations.get(request.conversationId))!
        : await conversations.create(request.question.slice(0, 80))
      await conversations.appendExchange(
        conversation.id,
        request.question,
        answer.text,
        answer.citations,
        answer.grounding
      )
      return {
        conversationId: conversation.id,
        answer: {
          kind: 'answer',
          text: answer.text,
          citations: answer.citations.map(publicCitation),
          grounding: answer.grounding
        }
      }
    } finally {
      activeRequests.delete(request.requestId)
    }
  })

  ipc.handle(ipcChannels.cancelQuestion, (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Chat cancellation requires one request ID.')
    activeRequests.get(validateIdentifier(args[0], 'Request ID'))?.abort()
  })

  ipc.handle(ipcChannels.listConversations, async (event, ...args) => {
    trusted(event)
    if (args.length !== 0) throw new Error('Conversation listing does not accept arguments.')
    return conversations.list()
  })

  ipc.handle(
    ipcChannels.readConversation,
    async (event, ...args): Promise<ConversationDetails | null> => {
      trusted(event)
      if (args.length !== 1) throw new Error('Conversation read requires one ID.')
      const id = validateIdentifier(args[0], 'Conversation ID')
      const conversation = await conversations.get(id)
      if (!conversation) return null
      const messages = await conversations.listMessages(id)
      return {
        ...conversation,
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations.map(publicCitation),
          grounding: message.grounding,
          createdAt: message.createdAt
        }))
      }
    }
  )

  ipc.handle(ipcChannels.deleteConversation, async (event, ...args) => {
    trusted(event)
    if (args.length !== 1) throw new Error('Conversation deletion requires one ID.')
    await conversations.delete(validateIdentifier(args[0], 'Conversation ID'))
  })
}
