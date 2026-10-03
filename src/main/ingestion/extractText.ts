import type { SupportedDocumentType } from './filePolicy'
import { extractMarkdown, markdownExtractor } from './extractors/markdown'
import { officeParserExtractor, supportsOfficeParser } from './extractors/officeParser'
import { extractPlainText, plainTextExtractor } from './extractors/plainText'

export type SourceKind = 'page' | 'slide' | 'sheet' | 'chapter' | 'section'

export interface ExtractedSection {
  text: string
  startOffset: number
  endOffset: number
  heading: string | null
  sourceKind: SourceKind | null
  sourceIndex: number | null
  sourceLabel: string | null
}

export interface ExtractionResult {
  text: string
  sections: ExtractedSection[]
  extractorVersion: string
  warnings?: string[]
}

export interface ExtractionRequest {
  path: string
  type: SupportedDocumentType
  signal?: AbortSignal
}

export interface TextExtractor {
  readonly id: string
  readonly version: string
  supports(type: SupportedDocumentType): boolean
  extract(request: ExtractionRequest): Promise<ExtractionResult>
}

/** Dispatches a canonical path to its asynchronous, cancellable extractor. */
export async function extractText(request: ExtractionRequest): Promise<ExtractionResult> {
  if (request.type === 'markdown') return extractMarkdown(request)
  if (request.type === 'text') return extractPlainText(request)
  if (supportsOfficeParser(request.type)) return officeParserExtractor.extract(request)
  throw new Error(`No extractor is configured for ${request.type}.`)
}

export function extractorVersion(type: SupportedDocumentType): string {
  if (type === 'markdown') return markdownExtractor.version
  if (type === 'text') return plainTextExtractor.version
  if (supportsOfficeParser(type)) return `${officeParserExtractor.version}:${type}`
  throw new Error(`No extractor is configured for ${type}.`)
}

export function normalizeText(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
