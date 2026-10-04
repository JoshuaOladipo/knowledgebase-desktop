import { describe, expect, it, vi } from 'vitest'
import type { GenerationServerSettings } from '../../../shared/contracts'
import {
  OpenAiCompatibleGenerationProvider,
  validateGenerationServerSettings
} from './openAiCompatibleGenerationProvider'

const settings: GenerationServerSettings = {
  enabled: true,
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'local-model',
  requestTimeoutMs: 5_000,
  maximumOutputTokens: 512,
  temperature: 0.1
}

describe('OpenAiCompatibleGenerationProvider', () => {
  it('accepts bounded HTTP(S) endpoints without a host allowlist', () => {
    expect(validateGenerationServerSettings(settings)).toEqual(settings)
    expect(
      validateGenerationServerSettings({ ...settings, endpoint: 'https://models.example/v1/' })
        .endpoint
    ).toBe('https://models.example/v1')
    expect(
      validateGenerationServerSettings({ ...settings, endpoint: 'http://192.168.1.2:8080/v1' })
        .endpoint
    ).toBe('http://192.168.1.2:8080/v1')
    for (const endpoint of [
      'file:///tmp/model',
      'http://user:secret@localhost/v1',
      'http://localhost/v1?token=secret',
      'https://models.example/v1#fragment'
    ]) {
      expect(() => validateGenerationServerSettings({ ...settings, endpoint })).toThrow('Endpoint')
    }
    expect(() => validateGenerationServerSettings({ ...settings, extra: true })).toThrow(
      'unknown field'
    )
  })

  it('calls chat completions without credentials and validates structured citations', async () => {
    let receivedInit: RequestInit | undefined
    const fetchImplementation = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        receivedInit = init
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '```json\n{"answer":"Grounded answer","citations":["source-1","fake"]}\n```'
                }
              }
            ]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
    )
    const provider = new OpenAiCompatibleGenerationProvider(settings, fetchImplementation)
    await expect(
      provider.generate({
        systemInstruction: 'Use evidence only.',
        prompt: '<evidence>Fact</evidence>',
        allowedSourceIds: ['source-1']
      })
    ).resolves.toEqual({ text: 'Grounded answer', citedSourceIds: ['source-1'] })
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' }
      })
    )
    expect(JSON.stringify(receivedInit)).not.toContain('authorization')
    expect(JSON.parse(String(receivedInit?.body))).toMatchObject({
      model: 'local-model',
      stream: false,
      max_tokens: 512,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'pc_agent_answer',
          strict: true,
          schema: {
            required: ['answer', 'citations'],
            additionalProperties: false
          }
        }
      }
    })
  })

  it('rejects malformed responses and supports cancellation', async () => {
    const malformed = new OpenAiCompatibleGenerationProvider(
      settings,
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), {
            status: 200
          })
      )
    )
    await expect(
      malformed.generate({ systemInstruction: 'System', prompt: 'Prompt', allowedSourceIds: [] })
    ).rejects.toMatchObject({ invalidResponse: true })

    const oversized = new OpenAiCompatibleGenerationProvider(
      settings,
      vi.fn(
        async () =>
          new Response('', {
            status: 200,
            headers: { 'content-length': '1048577' }
          })
      )
    )
    await expect(
      oversized.generate({ systemInstruction: 'System', prompt: 'Prompt', allowedSourceIds: [] })
    ).rejects.toThrow('too large')

    const controller = new AbortController()
    const cancelled = new OpenAiCompatibleGenerationProvider(
      settings,
      vi.fn(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Cancelled', 'AbortError'))
            )
          })
      )
    )
    const pending = cancelled.generate(
      { systemInstruction: 'System', prompt: 'Prompt', allowedSourceIds: [] },
      controller.signal
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('classifies non-success status without retaining response content', async () => {
    const provider = new OpenAiCompatibleGenerationProvider(
      settings,
      vi.fn(async () => new Response('sensitive server response', { status: 503 }))
    )
    const error = await provider
      .generate({ systemInstruction: 'System', prompt: 'Prompt', allowedSourceIds: [] })
      .catch((failure) => failure)
    expect(error).toMatchObject({ status: 503 })
    expect(error.message).not.toContain('sensitive')
  })
})
