import { readFile } from 'node:fs/promises'
import type { ExtractionRequest, ExtractionResult, TextExtractor } from '../extractText'
import { normalizeText } from '../extractText'

export const plainTextExtractor: TextExtractor = {
  id: 'plain-text',
  version: 'plain-text-v2',
  supports: (type) => type === 'text',
  async extract(request): Promise<ExtractionResult> {
    if (request.signal?.aborted) throw new DOMException('Extraction was cancelled.', 'AbortError')
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(request.path))
    if (request.signal?.aborted) throw new DOMException('Extraction was cancelled.', 'AbortError')
    const text = normalizeText(source)
    return {
      text,
      extractorVersion: this.version,
      sections: text
        ? [
            {
              text,
              startOffset: 0,
              endOffset: text.length,
              heading: null,
              sourceKind: null,
              sourceIndex: null,
              sourceLabel: null
            }
          ]
        : []
    }
  }
}

export const extractPlainText = (request: ExtractionRequest): Promise<ExtractionResult> =>
  plainTextExtractor.extract(request)
