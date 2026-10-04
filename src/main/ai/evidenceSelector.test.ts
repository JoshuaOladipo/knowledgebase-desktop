import { describe, expect, it } from 'vitest'
import type { RetrievalCandidate } from '../database/vectorRetriever'
import { selectEvidence } from './evidenceSelector'

function candidate(overrides: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    chunkId: 'chunk-1',
    documentId: 'document-1',
    documentPath: '/documents/example.md',
    documentName: 'example.md',
    watchedRoot: '/documents',
    ordinal: 0,
    content: 'Relevant evidence',
    tokenCount: 10,
    startOffset: 0,
    endOffset: 100,
    heading: 'Heading',
    sourceKind: 'section',
    sourceIndex: 1,
    sourceLabel: 'Heading',
    rank: 1,
    distance: 0.1,
    ...overrides
  }
}

describe('selectEvidence', () => {
  it('deduplicates content and heavily overlapping chunks while preserving stable sources', () => {
    const result = selectEvidence(
      [
        candidate(),
        candidate({ chunkId: 'duplicate', rank: 2, content: '  RELEVANT   EVIDENCE ' }),
        candidate({
          chunkId: 'overlap',
          rank: 3,
          content: 'Different overlap',
          startOffset: 20,
          endOffset: 90
        }),
        candidate({
          chunkId: 'other',
          documentId: 'document-2',
          rank: 4,
          content: 'Other evidence'
        })
      ],
      { contextTokenBudget: 25 }
    )
    expect(result).toEqual({
      kind: 'evidence',
      totalTokens: 20,
      items: [
        expect.objectContaining({ chunkId: 'chunk-1', sourceId: 'chunk-1' }),
        expect.objectContaining({ chunkId: 'other', sourceId: 'other' })
      ]
    })
  })

  it('enforces relevance, result, candidate, and context limits deterministically', () => {
    const inputs = [
      candidate({ chunkId: 'one', documentId: 'one', tokenCount: 8 }),
      candidate({ chunkId: 'two', documentId: 'two', rank: 2, tokenCount: 8, distance: 0.2 }),
      candidate({ chunkId: 'three', documentId: 'three', rank: 3, tokenCount: 8, distance: 0.3 })
    ]
    expect(
      selectEvidence(inputs, { maximumCandidates: 2, maximumResults: 1, contextTokenBudget: 16 })
    ).toMatchObject({
      kind: 'evidence',
      items: [{ chunkId: 'one' }],
      totalTokens: 8
    })
    expect(selectEvidence(inputs, { contextTokenBudget: 7 })).toEqual({
      kind: 'insufficient-context',
      reason: 'budget-exhausted'
    })
    expect(selectEvidence(inputs, { maximumDistance: 0.05 })).toEqual({
      kind: 'insufficient-context',
      reason: 'below-relevance'
    })
    expect(selectEvidence([])).toEqual({
      kind: 'insufficient-context',
      reason: 'no-candidates'
    })
  })

  it('validates every configured bound', () => {
    expect(() => selectEvidence([candidate()], { maximumCandidates: 0 })).toThrow('Candidate limit')
    expect(() => selectEvidence([candidate()], { maximumResults: 21 })).toThrow('Result limit')
    expect(() => selectEvidence([candidate()], { maximumDistance: 3 })).toThrow('Maximum distance')
    expect(() => selectEvidence([candidate()], { overlapThreshold: -1 })).toThrow(
      'Overlap threshold'
    )
  })
})
