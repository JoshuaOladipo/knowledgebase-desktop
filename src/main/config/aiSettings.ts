import { createHash } from 'node:crypto'
import type { EmbeddingProvider } from '../ai/embeddingProvider'
import { LocalHashEmbeddingProvider } from '../ai/providers/localHashEmbeddingProvider'

export interface AiSettings {
  embeddingProvider: 'local'
  embeddingModel: string
  embeddingDimensions: number
  embeddingBatchSize: number
}

export const defaultAiSettings: AiSettings = {
  embeddingProvider: 'local',
  embeddingModel: 'token-hash-v1',
  embeddingDimensions: 384,
  embeddingBatchSize: 32
}

/** Creates the configured provider without exposing credentials to renderer state. */
export function createEmbeddingProvider(settings = defaultAiSettings): EmbeddingProvider {
  if (settings.embeddingProvider !== 'local' || settings.embeddingModel !== 'token-hash-v1') {
    throw new Error('Unsupported embedding provider configuration.')
  }
  return new LocalHashEmbeddingProvider(settings.embeddingDimensions, settings.embeddingBatchSize)
}

export function embeddingConfigurationFingerprint(provider: EmbeddingProvider): string {
  return createHash('sha256')
    .update(`${provider.id}\0${provider.model}\0${provider.dimensions}`)
    .digest('hex')
}
