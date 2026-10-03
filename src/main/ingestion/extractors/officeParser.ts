import { OfficeErrorType, OfficeParser } from 'officeparser'
import type {
  OfficeContentNode,
  OfficeParserAST,
  OfficeParserConfig,
  SupportedFileType
} from 'officeparser'
import { contentHash } from '../contentHash'
import type { SupportedDocumentType } from '../filePolicy'
import type {
  ExtractedSection,
  ExtractionRequest,
  ExtractionResult,
  SourceKind,
  TextExtractor
} from '../extractText'
import { normalizeText } from '../extractText'

const OFFICEPARSER_VERSION = '7.5.0'
const ADAPTER_VERSION = 'office-ast-v1'
const OFFICE_TYPES = new Set<SupportedDocumentType>([
  'docx',
  'pptx',
  'xlsx',
  'odt',
  'odp',
  'ods',
  'pdf',
  'rtf',
  'epub'
])

export const officeParserPolicy = {
  ignoreNotes: true,
  ignoreComments: true,
  ignoreHeadersAndFooters: true,
  ignoreSlideMasters: true,
  extractAttachments: false,
  includeRawContent: false,
  ocr: false,
  includeBreakNodes: true,
  ignoreInternalLinks: false,
  decompressionLimits: {
    maxUncompressedBytes: 64 * 1024 * 1024,
    maxZipEntries: 5_000,
    maxTableCells: 250_000
  }
} as const

const POLICY_FINGERPRINT = contentHash(JSON.stringify(officeParserPolicy)).slice(0, 16)
type OfficeIssue = Parameters<NonNullable<OfficeParserConfig['onWarning']>>[0]

export function supportsOfficeParser(
  type: SupportedDocumentType
): type is Exclude<SupportedDocumentType, 'text' | 'markdown'> {
  return OFFICE_TYPES.has(type)
}

function nodeText(node: OfficeContentNode): string {
  const ownText = normalizeText(node.text ?? '')
  if (ownText) return ownText
  return normalizeText((node.children ?? []).map(nodeText).filter(Boolean).join('\n'))
}

function numericMetadata(
  node: OfficeContentNode,
  key: 'pageNumber' | 'slideNumber'
): number | null {
  const metadata = node.metadata as Record<string, unknown> | undefined
  return typeof metadata?.[key] === 'number' ? metadata[key] : null
}

function stringMetadata(node: OfficeContentNode, key: 'sheetName'): string | null {
  const metadata = node.metadata as Record<string, unknown> | undefined
  return typeof metadata?.[key] === 'string' ? metadata[key] : null
}

interface SectionDraft {
  text: string
  heading: string | null
  sourceKind: SourceKind | null
  sourceIndex: number | null
  sourceLabel: string | null
}

function containerSections(ast: OfficeParserAST): SectionDraft[] | null {
  const definition:
    | {
        nodeType: OfficeContentNode['type']
        kind: SourceKind
        indexKey?: 'pageNumber' | 'slideNumber'
      }
    | undefined =
    ast.type === 'pdf'
      ? { nodeType: 'page', kind: 'page', indexKey: 'pageNumber' }
      : ast.type === 'pptx' || ast.type === 'odp'
        ? { nodeType: 'slide', kind: 'slide', indexKey: 'slideNumber' }
        : ast.type === 'xlsx' || ast.type === 'ods'
          ? { nodeType: 'sheet', kind: 'sheet' }
          : undefined
  if (!definition) return null

  return ast.content
    .filter((node) => node.type === definition.nodeType)
    .map((node, index) => {
      const text = nodeText(node)
      const sourceLabel = definition.kind === 'sheet' ? stringMetadata(node, 'sheetName') : null
      const sourceIndex = definition.indexKey
        ? numericMetadata(node, definition.indexKey)
        : index + 1
      return {
        text,
        heading: sourceLabel,
        sourceKind: definition.kind,
        sourceIndex,
        sourceLabel
      }
    })
    .filter(({ text }) => text.length > 0)
}

function headingSections(ast: OfficeParserAST): SectionDraft[] {
  const sections: SectionDraft[] = []
  let heading: string | null = null
  let content: string[] = []
  let sourceIndex = 0
  const sourceKind: SourceKind = ast.type === 'epub' ? 'chapter' : 'section'

  const flush = (): void => {
    const text = normalizeText(content.join('\n\n'))
    if (text) {
      sections.push({
        text,
        heading,
        sourceKind,
        sourceIndex: heading ? sourceIndex : null,
        sourceLabel: heading
      })
    }
    content = []
  }

  for (const node of ast.content) {
    const text = nodeText(node)
    if (!text) continue
    if (node.type === 'heading') {
      flush()
      heading = text
      sourceIndex += 1
    }
    content.push(text)
  }
  flush()
  return sections
}

/** Converts an OfficeParser AST into deterministic application sections. */
export function officeAstToExtraction(
  ast: OfficeParserAST,
  warnings: string[] = []
): ExtractionResult {
  const drafts = containerSections(ast) ?? headingSections(ast)
  const sections: ExtractedSection[] = []
  let offset = 0
  for (const draft of drafts) {
    if (sections.length > 0) offset += 2
    const startOffset = offset
    offset += draft.text.length
    sections.push({
      ...draft,
      startOffset,
      endOffset: offset
    })
  }
  return {
    text: sections.map(({ text }) => text).join('\n\n'),
    sections,
    extractorVersion: `${ADAPTER_VERSION}:${OFFICEPARSER_VERSION}:${POLICY_FINGERPRINT}:${ast.type}`,
    warnings: [...new Set(warnings)]
  }
}

function sanitizedWarning(issue: OfficeIssue): string {
  return `OfficeParser warning: ${String(issue.code)}`
}

function sanitizedParserError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return error
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : OfficeErrorType.FILE_CORRUPTED
  const safeCodes = new Set<string>(Object.values(OfficeErrorType))
  return new Error(
    `OfficeParser could not extract this document (${safeCodes.has(code) ? code : OfficeErrorType.FILE_CORRUPTED}).`
  )
}

export const officeParserExtractor: TextExtractor = {
  id: 'officeparser',
  version: `${ADAPTER_VERSION}:${OFFICEPARSER_VERSION}:${POLICY_FINGERPRINT}`,
  supports: supportsOfficeParser,
  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    if (!supportsOfficeParser(request.type)) {
      throw new Error(`OfficeParser does not handle ${request.type}.`)
    }
    const warnings: string[] = []
    const config: OfficeParserConfig<SupportedFileType> = {
      ...officeParserPolicy,
      fileType: request.type,
      abortSignal: request.signal,
      onWarning: (issue) => warnings.push(sanitizedWarning(issue))
    }
    try {
      const ast = await OfficeParser.parseOffice(request.path, config)
      if (request.signal?.aborted) {
        throw new DOMException('Extraction was cancelled.', 'AbortError')
      }
      warnings.push(...ast.warnings.map(sanitizedWarning))
      return officeAstToExtraction(ast, warnings)
    } catch (error) {
      throw sanitizedParserError(error)
    }
  }
}
