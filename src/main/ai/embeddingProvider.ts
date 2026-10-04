export interface EmbeddingProvider {
  readonly id: string
  readonly model: string
  readonly dimensions: number
  readonly batchSize: number
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>
}

export interface EmbeddingRetryOptions {
  attempts?: number
  initialDelayMs?: number
  isTransient?: (error: unknown) => boolean
}

function abortError(): DOMException {
  return new DOMException('Embedding was cancelled.', 'AbortError')
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError()
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(abortError())
      },
      { once: true }
    )
  })
}

/** Embeds in bounded batches and retries transient failures with exponential backoff. */
export async function embedInBatches(
  provider: EmbeddingProvider,
  texts: string[],
  signal?: AbortSignal,
  options: EmbeddingRetryOptions = {}
): Promise<number[][]> {
  const attempts = options.attempts ?? 3
  const initialDelayMs = options.initialDelayMs ?? 200
  const isTransient =
    options.isTransient ??
    ((error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      ('transient' in error || ('status' in error && Number(error.status) >= 500)))
  const embeddings: number[][] = []

  for (let offset = 0; offset < texts.length; offset += provider.batchSize) {
    const batch = texts.slice(offset, offset + provider.batchSize)
    let lastError: unknown
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (signal?.aborted) throw abortError()
      try {
        const result = await provider.embed(batch, signal)
        if (
          result.length !== batch.length ||
          result.some(
            (embedding) =>
              embedding.length !== provider.dimensions ||
              embedding.some((value) => !Number.isFinite(value))
          )
        ) {
          throw new Error('The embedding provider returned an invalid result.')
        }
        embeddings.push(...result)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        if (signal?.aborted || attempt === attempts - 1 || !isTransient(error)) throw error
        await delay(initialDelayMs * 2 ** attempt, signal)
      }
    }
    if (lastError) throw lastError
  }
  return embeddings
}
