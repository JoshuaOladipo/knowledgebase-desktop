import type { ExtractionResult } from './extractText'
import type { SourceKind } from './extractText'

export const CHUNKER_VERSION = 'paragraph-v1'

export interface TextChunk {
  ordinal: number
  content: string
  tokenCount: number
  startOffset: number
  endOffset: number
  heading: string | null
  sourceKind: SourceKind | null
  sourceIndex: number | null
  sourceLabel: string | null
}

export interface ChunkOptions {
  targetTokens?: number
  overlapTokens?: number
  minimumTokens?: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function splitOversizedParagraph(
  paragraph: { text: string; start: number },
  targetTokens: number,
  overlapTokens: number
): Array<{ text: string; start: number }> {
  if (estimateTokens(paragraph.text) <= targetTokens) return [paragraph]
  const words = [...paragraph.text.matchAll(/\S+/g)]
  const segments: Array<{ text: string; start: number }> = []
  let firstWord = 0
  while (firstWord < words.length) {
    let lastWord = firstWord
    while (
      lastWord + 1 < words.length &&
      estimateTokens(
        paragraph.text.slice(
          words[firstWord].index,
          words[lastWord + 1].index! + words[lastWord + 1][0].length
        )
      ) <= targetTokens
    ) {
      lastWord += 1
    }
    const startInParagraph = words[firstWord].index ?? 0
    const endInParagraph = (words[lastWord].index ?? 0) + words[lastWord][0].length
    segments.push({
      text: paragraph.text.slice(startInParagraph, endInParagraph),
      start: paragraph.start + startInParagraph
    })
    if (lastWord === words.length - 1) break
    let overlapStart = lastWord
    while (
      overlapStart > firstWord &&
      estimateTokens(paragraph.text.slice(words[overlapStart - 1].index, endInParagraph)) <=
        overlapTokens
    ) {
      overlapStart -= 1
    }
    firstWord = Math.max(firstWord + 1, overlapStart)
  }
  return segments
}

/** Chunks sections on paragraph boundaries with a bounded trailing overlap. */
export function chunkText(extracted: ExtractionResult, options: ChunkOptions = {}): TextChunk[] {
  const targetTokens = options.targetTokens ?? 650
  const overlapTokens = options.overlapTokens ?? 100
  const minimumTokens = options.minimumTokens ?? 10
  const chunks: Omit<TextChunk, 'ordinal'>[] = []

  for (const section of extracted.sections) {
    const paragraphs = [...section.text.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)]
      .map((match) => ({
        text: match[0].trim(),
        start: section.startOffset + (match.index ?? 0)
      }))
      .flatMap((paragraph) => splitOversizedParagraph(paragraph, targetTokens, overlapTokens))
    let current: typeof paragraphs = []
    let currentTokens = 0

    const flush = (): void => {
      if (current.length === 0) return
      const content = current.map(({ text }) => text).join('\n\n')
      const tokenCount = estimateTokens(content)
      if (tokenCount >= minimumTokens) {
        chunks.push({
          content,
          tokenCount,
          startOffset: current[0].start,
          endOffset: current.at(-1)!.start + current.at(-1)!.text.length,
          heading: section.heading,
          sourceKind: section.sourceKind,
          sourceIndex: section.sourceIndex,
          sourceLabel: section.sourceLabel
        })
      }
      const overlap: typeof paragraphs = []
      let tokens = 0
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const paragraphTokens = estimateTokens(current[index].text)
        if (tokens + paragraphTokens > overlapTokens) break
        overlap.unshift(current[index])
        tokens += paragraphTokens
      }
      current = overlap
      currentTokens = tokens
    }

    for (const paragraph of paragraphs) {
      const paragraphTokens = estimateTokens(paragraph.text)
      if (currentTokens + paragraphTokens > targetTokens && current.length > 0) flush()
      current.push(paragraph)
      currentTokens += paragraphTokens
    }
    flush()
  }

  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }))
}
