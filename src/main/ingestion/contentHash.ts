import { createHash } from 'node:crypto'

export function contentHash(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function ingestionConfigurationFingerprint(configuration: {
  extractorVersion: string
  chunkerVersion: string
  embeddingFingerprint: string
}): string {
  return contentHash(
    `${configuration.extractorVersion}\0${configuration.chunkerVersion}\0${configuration.embeddingFingerprint}`
  )
}
