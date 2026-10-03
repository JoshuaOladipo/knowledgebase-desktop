import { createHash } from 'node:crypto'
import type { EmbeddingProvider } from '../embeddingProvider'

/**
 * A deterministic, credential-free baseline provider. It hashes normalized
 * tokens into a signed feature vector so P0 indexing works fully locally.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local'
  readonly model = 'token-hash-v1'

  constructor(
    readonly dimensions = 384,
    readonly batchSize = 32
  ) {
    if (dimensions < 8) throw new Error('Embedding dimensions must be at least 8.')
    if (batchSize < 1) throw new Error('Embedding batch size must be positive.')
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    return texts.map((text) => {
      if (signal?.aborted) throw new DOMException('Embedding was cancelled.', 'AbortError')
      const vector = new Array<number>(this.dimensions).fill(0)
      const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}_'-]+/gu) ?? []
      for (const token of tokens) {
        const digest = createHash('sha256').update(token).digest()
        const index = digest.readUInt32LE(0) % this.dimensions
        vector[index] += digest[4] % 2 === 0 ? 1 : -1
      }
      const magnitude = Math.hypot(...vector)
      return magnitude === 0 ? vector : vector.map((value) => value / magnitude)
    })
  }
}
