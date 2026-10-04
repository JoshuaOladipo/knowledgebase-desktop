import { useEffect, useState, type FormEvent } from 'react'
import type {
  ChatMessage,
  ConversationSummary,
  LocalGenerationSettings
} from '../../../shared/contracts'
import {
  beginChatRequest,
  cancelChatRequest,
  completeChatRequest,
  createChatMessage,
  idleChatRequest,
  messageForAnswer
} from '../chatPresentation'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Provides local-server configuration, grounded chat, citations, and retained conversations. */
export default function ChatPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<LocalGenerationSettings>()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState<string>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [requestState, setRequestState] = useState(idleChatRequest)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [savingSettings, setSavingSettings] = useState(false)
  const activeRequestId = requestState.requestId

  async function refreshConversations(): Promise<void> {
    setConversations(await window.pcAgent.listConversations())
  }

  useEffect(() => {
    let active = true
    void Promise.all([
      window.pcAgent.getLocalGenerationSettings(),
      window.pcAgent.listConversations()
    ])
      .then(([loadedSettings, loadedConversations]) => {
        if (!active) return
        setSettings(loadedSettings)
        setConversations(loadedConversations)
      })
      .catch((cause) => {
        if (active) setError(`Could not load chat: ${errorMessage(cause)}`)
      })
    return () => {
      active = false
    }
  }, [])

  async function saveSettings(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!settings) return
    setError(undefined)
    setNotice(undefined)
    setSavingSettings(true)
    try {
      setSettings(await window.pcAgent.updateLocalGenerationSettings(settings))
      setNotice('Local server settings saved.')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSavingSettings(false)
    }
  }

  async function openConversation(id: string): Promise<void> {
    setError(undefined)
    try {
      const conversation = await window.pcAgent.readConversation(id)
      if (!conversation) throw new Error('Conversation no longer exists.')
      setConversationId(conversation.id)
      setMessages(conversation.messages)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function deleteCurrentConversation(): Promise<void> {
    if (!conversationId) return
    setError(undefined)
    try {
      await window.pcAgent.deleteConversation(conversationId)
      setConversationId(undefined)
      setMessages([])
      await refreshConversations()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function ask(event: FormEvent): Promise<void> {
    event.preventDefault()
    const normalizedQuestion = question.trim()
    if (!normalizedQuestion || activeRequestId) return
    const requestId = crypto.randomUUID()
    setError(undefined)
    setNotice(undefined)
    setQuestion('')
    setRequestState(beginChatRequest(requestId))
    setMessages((current) => [...current, createChatMessage('user', normalizedQuestion)])
    try {
      const result = await window.pcAgent.askQuestion({
        requestId,
        conversationId,
        question: normalizedQuestion
      })
      if (result.conversationId) setConversationId(result.conversationId)
      setMessages((current) => [...current, messageForAnswer(result.answer)])
      if (result.answer.kind === 'answer') {
        await refreshConversations()
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setRequestState(completeChatRequest())
    }
  }

  async function cancel(): Promise<void> {
    if (!activeRequestId) return
    try {
      setRequestState((current) => cancelChatRequest(current))
      await window.pcAgent.cancelQuestion(activeRequestId)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <section className="rounded-box bg-base-100 p-4 shadow-sm" aria-labelledby="chat-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="chat-heading" className="font-semibold">
            Ask your files
          </h2>
          <p className="text-sm text-base-content/60">
            Answers use indexed evidence and your user-managed local model server.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => {
            setConversationId(undefined)
            setMessages([])
            setError(undefined)
          }}
        >
          New chat
        </button>
      </div>

      <details className="collapse-arrow collapse mt-4 border border-base-300">
        <summary className="collapse-title font-medium">Local model server settings</summary>
        <div className="collapse-content">
          {settings ? (
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(event) => void saveSettings(event)}
            >
              <label className="form-control md:col-span-2">
                <span className="label-text mb-1">OpenAI-compatible base URL</span>
                <input
                  className="input input-bordered w-full font-mono text-sm"
                  type="url"
                  required
                  value={settings.endpoint}
                  onChange={(event) =>
                    setSettings({ ...settings, endpoint: event.currentTarget.value })
                  }
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Model name</span>
                <input
                  className="input input-bordered w-full"
                  required
                  value={settings.model}
                  onChange={(event) =>
                    setSettings({ ...settings, model: event.currentTarget.value })
                  }
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Timeout (milliseconds)</span>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  min="1000"
                  max="300000"
                  value={settings.requestTimeoutMs}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      requestTimeoutMs: event.currentTarget.valueAsNumber
                    })
                  }
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Maximum output tokens</span>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  min="1"
                  max="8192"
                  value={settings.maximumOutputTokens}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      maximumOutputTokens: event.currentTarget.valueAsNumber
                    })
                  }
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Temperature</span>
                <input
                  className="input input-bordered w-full"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(event) =>
                    setSettings({ ...settings, temperature: event.currentTarget.valueAsNumber })
                  }
                />
              </label>
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  className="toggle toggle-primary"
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, enabled: event.currentTarget.checked })
                  }
                />
                <span className="label-text">Enable this local server</span>
              </label>
              <div className="flex justify-end md:col-span-2">
                <button className="btn btn-primary btn-sm" disabled={savingSettings} type="submit">
                  {savingSettings ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </form>
          ) : (
            <span className="loading loading-spinner" aria-label="Loading settings" />
          )}
        </div>
      </details>

      {conversations.length > 0 && (
        <div className="mt-4">
          <label className="label-text" htmlFor="conversation-select">
            Conversation history
          </label>
          <div className="mt-1 flex gap-2">
            <select
              id="conversation-select"
              className="select select-bordered min-w-0 flex-1"
              value={conversationId ?? ''}
              onChange={(event) => {
                const id = event.currentTarget.value
                if (id) void openConversation(id)
              }}
            >
              <option value="">Select a conversation</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
            <button
              className="btn btn-outline btn-error"
              type="button"
              disabled={!conversationId || Boolean(activeRequestId)}
              onClick={() => void deleteCurrentConversation()}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div
        className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-box bg-base-200 p-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-base-content/55">
            Ask a question after your watched files finish indexing.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-box p-3 ${
                message.role === 'user'
                  ? 'ml-8 bg-primary text-primary-content'
                  : 'mr-8 bg-base-100'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              {message.citations.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide">Sources</p>
                  {message.citations.map((citation) => (
                    <details
                      className="rounded border border-base-300 p-2 text-xs"
                      key={citation.sourceId}
                    >
                      <summary className="cursor-pointer font-medium">
                        {citation.documentName}
                        {citation.sourceLabel ? ` — ${citation.sourceLabel}` : ''}
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-base-content/70">
                        {citation.excerpt}
                      </p>
                      <p className="mt-2 break-all font-mono text-base-content/50">
                        {citation.documentPath}
                      </p>
                      <button
                        className="btn btn-ghost btn-xs mt-2"
                        type="button"
                        onClick={() =>
                          void window.pcAgent
                            .revealCitation(citation.documentPath)
                            .catch((cause) => setError(errorMessage(cause)))
                        }
                      >
                        Reveal file
                      </button>
                    </details>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <form className="mt-4" onSubmit={(event) => void ask(event)}>
        <label className="sr-only" htmlFor="chat-question">
          Question
        </label>
        <textarea
          id="chat-question"
          className="textarea textarea-bordered min-h-24 w-full"
          maxLength={10_000}
          placeholder="What do my files say about…"
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
        />
        <div className="mt-2 flex justify-end gap-2">
          {activeRequestId && (
            <button className="btn btn-outline" type="button" onClick={() => void cancel()}>
              Cancel
            </button>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!question.trim() || Boolean(activeRequestId) || !settings?.enabled}
          >
            {requestState.phase === 'cancelling'
              ? 'Cancelling…'
              : activeRequestId
                ? 'Answering…'
                : 'Ask'}
          </button>
        </div>
      </form>

      {notice && <p className="alert alert-success mt-3 text-sm">{notice}</p>}
      {error && (
        <p className="alert alert-error mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
