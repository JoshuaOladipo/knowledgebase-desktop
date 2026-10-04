import { describe, expect, it, vi } from 'vitest'
import type { EmbeddingProvider } from './embeddingProvider'
import { embedInBatches } from './embeddingProvider'
import { LocalHashEmbeddingProvider } from './providers/localHashEmbeddingProvider'

describe('embedding providers', () => {
  it('produces deterministic, normalized local embeddings', async () => {
    const provider = new LocalHashEmbeddingProvider(16, 2)
    const [first, second] = await provider.embed(['Alpha beta', 'Alpha beta'])
    expect(first).toEqual(second)
    expect(first).toHaveLength(16)
    expect(Math.hypot(...first)).toBeCloseTo(1)
  })

  it('batches requests and retries only transient failures', async () => {
    const embed = vi
      .fn<EmbeddingProvider['embed']>()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { transient: true }))
      .mockImplementation(async (texts) => texts.map(() => [1, 0]))
    const provider: EmbeddingProvider = {
      id: 'fake',
      model: 'fake',
      dimensions: 2,
      batchSize: 2,
      embed
    }
    await expect(
      embedInBatches(provider, ['one', 'two', 'three'], undefined, { initialDelayMs: 0 })
    ).resolves.toEqual([
      [1, 0],
      [1, 0],
      [1, 0]
    ])
    expect(embed).toHaveBeenCalledTimes(3)

    embed.mockReset().mockRejectedValue(new Error('authentication failed'))
    await expect(
      embedInBatches(provider, ['one'], undefined, { initialDelayMs: 0 })
    ).rejects.toThrow('authentication')
    expect(embed).toHaveBeenCalledOnce()
  })
})
