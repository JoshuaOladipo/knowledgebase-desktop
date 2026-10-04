import type { LocalGenerationSettings } from '../../../shared/contracts'
import type { GenerationProvider, GenerationRequest, GenerationResult } from '../generationProvider'

type FetchImplementation = typeof fetch

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>
}

const MAXIMUM_RESPONSE_BYTES = 1_048_576

async function readBoundedResponse(
  response: Response,
  controller: AbortController
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_RESPONSE_BYTES) {
    controller.abort()
    throw Object.assign(new Error('Local generation server response is too large.'), {
      invalidResponse: true
    })
  }
  if (!response.body) {
    throw Object.assign(new Error('Local generation server returned no response body.'), {
      invalidResponse: true
    })
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAXIMUM_RESPONSE_BYTES) {
        controller.abort()
        throw Object.assign(new Error('Local generation server response is too large.'), {
          invalidResponse: true
        })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw Object.assign(new Error('Local generation server returned malformed JSON.'), {
      invalidResponse: true
    })
  }
}

export function validateLocalGenerationSettings(value: unknown): LocalGenerationSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Local generation settings must be an object.')
  }
  const input = value as Record<string, unknown>
  const known = new Set([
    'enabled',
    'endpoint',
    'model',
    'requestTimeoutMs',
    'maximumOutputTokens',
    'temperature'
  ])
  if (Object.keys(input).some((key) => !known.has(key))) {
    throw new Error('Local generation settings contain an unknown field.')
  }
  if (typeof input.enabled !== 'boolean') throw new Error('Enabled must be a boolean.')
  if (typeof input.endpoint !== 'string' || input.endpoint.length > 2_048) {
    throw new Error('Endpoint must be a valid loopback URL.')
  }
  let endpoint: URL
  try {
    endpoint = new URL(input.endpoint)
  } catch {
    throw new Error('Endpoint must be a valid loopback URL.')
  }
  const hostname = endpoint.hostname.toLocaleLowerCase()
  if (
    (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
    !['localhost', '127.0.0.1', '[::1]', '192.168.8.106'].includes(hostname) ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  ) {
    throw new Error('Endpoint must use HTTP(S) on localhost, 127.0.0.1, or [::1].')
  }
  const normalizedEndpoint = endpoint.href.replace(/\/$/, '')
  if (
    typeof input.model !== 'string' ||
    input.model.trim().length === 0 ||
    input.model.length > 200
  ) {
    throw new Error('Model must contain between 1 and 200 characters.')
  }
  if (
    !Number.isInteger(input.requestTimeoutMs) ||
    Number(input.requestTimeoutMs) < 1_000 ||
    Number(input.requestTimeoutMs) > 300_000
  ) {
    throw new Error('Request timeout must be between 1,000 and 300,000 milliseconds.')
  }
  if (
    !Number.isInteger(input.maximumOutputTokens) ||
    Number(input.maximumOutputTokens) < 1 ||
    Number(input.maximumOutputTokens) > 8_192
  ) {
    throw new Error('Maximum output tokens must be between 1 and 8,192.')
  }
  if (
    typeof input.temperature !== 'number' ||
    !Number.isFinite(input.temperature) ||
    input.temperature < 0 ||
    input.temperature > 2
  ) {
    throw new Error('Temperature must be between 0 and 2.')
  }
  return {
    enabled: input.enabled,
    endpoint: normalizedEndpoint,
    model: input.model.trim(),
    requestTimeoutMs: Number(input.requestTimeoutMs),
    maximumOutputTokens: Number(input.maximumOutputTokens),
    temperature: input.temperature
  }
}

function parseResult(content: string, allowedSourceIds: Set<string>): GenerationResult {
  const candidate = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    throw Object.assign(new Error('Local generation server returned malformed JSON.'), {
      invalidResponse: true
    })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw Object.assign(new Error('Local generation server returned an invalid result.'), {
      invalidResponse: true
    })
  }
  const result = parsed as Record<string, unknown>
  if (
    typeof result.answer !== 'string' ||
    result.answer.trim().length === 0 ||
    result.answer.length > 100_000 ||
    !Array.isArray(result.citations) ||
    result.citations.some((sourceId) => typeof sourceId !== 'string')
  ) {
    throw Object.assign(new Error('Local generation server returned an invalid result.'), {
      invalidResponse: true
    })
  }
  return {
    text: result.answer.trim(),
    citedSourceIds: [...new Set(result.citations as string[])].filter((sourceId) =>
      allowedSourceIds.has(sourceId)
    )
  }
}

/** Calls a user-managed, loopback-only OpenAI-compatible chat-completions server. */
export class LocalServerGenerationProvider implements GenerationProvider {
  readonly id = 'local-openai-compatible'
  readonly model: string

  constructor(
    private readonly settings: LocalGenerationSettings,
    private readonly fetchImplementation: FetchImplementation = fetch
  ) {
    this.settings = validateLocalGenerationSettings(settings)
    if (!this.settings.enabled) throw new Error('Local generation is not enabled.')
    this.model = this.settings.model
  }

  async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.settings.requestTimeoutMs)
    const abort = (): void => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await this.fetchImplementation(
        `${this.settings.endpoint}/chat/completions`,
        {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.settings.model,
            stream: false,
            temperature: this.settings.temperature,
            max_tokens: this.settings.maximumOutputTokens,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'pc_agent_answer',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    answer: { type: 'string', minLength: 1 },
                    citations: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['answer', 'citations'],
                  additionalProperties: false
                }
              }
            },
            messages: [
              {
                role: 'system',
                content:
                  `${request.systemInstruction}\n` +
                  'Return only JSON with shape {"answer":"...","citations":["source-id"]}.'
              },
              { role: 'user', content: request.prompt }
            ]
          }),
          signal: controller.signal
        }
      )
      if (!response.ok)
        throw Object.assign(new Error('Local generation request failed.'), {
          status: response.status
        })
      const payload = (await readBoundedResponse(response, controller)) as ChatCompletionResponse
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw Object.assign(new Error('Local generation server returned no message.'), {
          invalidResponse: true
        })
      }
      return parseResult(content, new Set(request.allowedSourceIds))
    } catch (error) {
      if (timedOut)
        throw Object.assign(new Error('Local generation request timed out.'), { unavailable: true })
      throw error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}
