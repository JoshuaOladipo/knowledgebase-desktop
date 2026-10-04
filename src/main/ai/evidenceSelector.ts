import type { RetrievalCandidate } from '../database/vectorRetriever'

export interface EvidenceSelectionOptions {
  maximumCandidates?: number
  maximumResults?: number
  maximumDistance?: number
  contextTokenBudget?: number
  overlapThreshold?: number
}

export interface SelectedEvidence extends RetrievalCandidate {
  sourceId: string
}

export type EvidenceSelection =
  | { kind: 'evidence'; items: SelectedEvidence[]; totalTokens: number }
  | {
      kind: 'insufficient-context'
      reason: 'no-candidates' | 'below-relevance' | 'budget-exhausted'
    }

function integer(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`)
  }
  return value
}

function normalizedContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function overlapRatio(left: RetrievalCandidate, right: RetrievalCandidate): number {
  if (left.documentId !== right.documentId) return 0
  const overlap = Math.max(
    0,
    Math.min(left.endOffset, right.endOffset) - Math.max(left.startOffset, right.startOffset)
  )
  const shortest = Math.min(left.endOffset - left.startOffset, right.endOffset - right.startOffset)
  return shortest > 0 ? overlap / shortest : 0
}

/** Selects stable, relevant and non-overlapping evidence within a strict context budget. */
export function selectEvidence(
  candidates: RetrievalCandidate[],
  options: EvidenceSelectionOptions = {}
): EvidenceSelection {
  const maximumCandidates = integer(options.maximumCandidates ?? 50, 1, 100, 'Candidate limit')
  const maximumResults = integer(options.maximumResults ?? 8, 1, 20, 'Result limit')
  const contextTokenBudget = integer(
    options.contextTokenBudget ?? 2_000,
    1,
    100_000,
    'Context budget'
  )
  const maximumDistance = options.maximumDistance ?? 0.45
  const overlapThreshold = options.overlapThreshold ?? 0.65
  if (!Number.isFinite(maximumDistance) || maximumDistance < 0 || maximumDistance > 2) {
    throw new Error('Maximum distance must be between 0 and 2.')
  }
  if (!Number.isFinite(overlapThreshold) || overlapThreshold < 0 || overlapThreshold > 1) {
    throw new Error('Overlap threshold must be between 0 and 1.')
  }
  if (candidates.length === 0) return { kind: 'insufficient-context', reason: 'no-candidates' }

  const relevant = candidates.slice(0, maximumCandidates).filter((candidate) => {
    return (
      Number.isFinite(candidate.distance) &&
      candidate.distance <= maximumDistance &&
      candidate.tokenCount > 0 &&
      candidate.content.trim().length > 0
    )
  })
  if (relevant.length === 0) return { kind: 'insufficient-context', reason: 'below-relevance' }

  const selected: SelectedEvidence[] = []
  const seenContent = new Set<string>()
  let totalTokens = 0
  for (const candidate of relevant) {
    if (selected.length >= maximumResults) break
    const normalized = normalizedContent(candidate.content)
    if (seenContent.has(normalized)) continue
    if (selected.some((existing) => overlapRatio(existing, candidate) >= overlapThreshold)) continue
    if (totalTokens + candidate.tokenCount > contextTokenBudget) continue
    seenContent.add(normalized)
    totalTokens += candidate.tokenCount
    selected.push({ ...candidate, sourceId: candidate.chunkId })
  }
  return selected.length > 0
    ? { kind: 'evidence', items: selected, totalTokens }
    : { kind: 'insufficient-context', reason: 'budget-exhausted' }
}
