export interface GenerationRequest {
  systemInstruction: string
  prompt: string
  allowedSourceIds: string[]
}

export interface GenerationResult {
  text: string
  citedSourceIds: string[]
}

export interface GenerationProvider {
  readonly id: string
  readonly model: string
  generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>
}

export type GenerationErrorCategory =
  'cancelled' | 'authentication' | 'rate-limit' | 'transient' | 'unavailable' | 'unknown'

export class GenerationError extends Error {
  constructor(readonly category: GenerationErrorCategory) {
    super(`Answer generation failed (${category}).`)
    this.name = 'GenerationError'
  }
}

/** Maps provider failures to content-free categories safe for UI and diagnostics. */
export function classifyGenerationError(error: unknown, signal?: AbortSignal): GenerationError {
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return new GenerationError('cancelled')
  }
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined
  if (status === 401 || status === 403) return new GenerationError('authentication')
  if (status === 429) return new GenerationError('rate-limit')
  if (status !== undefined && status >= 500) return new GenerationError('transient')
  if (typeof error === 'object' && error !== null && 'unavailable' in error) {
    return new GenerationError('unavailable')
  }
  return new GenerationError('unknown')
}
