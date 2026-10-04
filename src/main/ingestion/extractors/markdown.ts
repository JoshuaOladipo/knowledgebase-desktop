import type {
  ExtractedSection,
  ExtractionRequest,
  ExtractionResult,
  TextExtractor
} from '../extractText'
import { normalizeText } from '../extractText'

export const markdownExtractor: TextExtractor = {
  id: 'markdown',
  version: 'markdown-v2',
  supports: (type) => type === 'markdown',
  async extract(request): Promise<ExtractionResult> {
    if (request.signal?.aborted) throw new DOMException('Extraction was cancelled.', 'AbortError')
    const source = new TextDecoder('utf-8', { fatal: true }).decode(request.bytes)
    if (request.signal?.aborted) throw new DOMException('Extraction was cancelled.', 'AbortError')
    const text = normalizeText(source)
    if (!text) return { text, extractorVersion: this.version, sections: [] }
    const headingPattern = /^(#{1,6})\s+(.+)$/gm
    const headings = [...text.matchAll(headingPattern)]
    const sections: ExtractedSection[] = []

    if (headings.length === 0 || (headings[0].index ?? 0) > 0) {
      const end = headings[0]?.index ?? text.length
      const content = text.slice(0, end).trim()
      if (content) {
        const startOffset = text.indexOf(content)
        sections.push({
          text: content,
          startOffset,
          endOffset: startOffset + content.length,
          heading: null,
          sourceKind: null,
          sourceIndex: null,
          sourceLabel: null
        })
      }
    }
    for (let index = 0; index < headings.length; index += 1) {
      const match = headings[index]
      const startOffset = match.index ?? 0
      const endOffset = headings[index + 1]?.index ?? text.length
      const content = text.slice(startOffset, endOffset).trim()
      const heading = match[2].trim()
      sections.push({
        text: content,
        startOffset,
        endOffset: startOffset + content.length,
        heading,
        sourceKind: 'section',
        sourceIndex: index + 1,
        sourceLabel: heading
      })
    }
    return { text, sections, extractorVersion: this.version }
  }
}

export const extractMarkdown = (request: ExtractionRequest): Promise<ExtractionResult> =>
  markdownExtractor.extract(request)
