import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { OfficeParser, type OfficeParserAST } from 'officeparser'
import { describe, expect, it, vi } from 'vitest'
import { extractText } from '../extractText'
import { officeAstToExtraction, officeParserExtractor } from './officeParser'
import type { SupportedDocumentType } from '../filePolicy'

const fixturePath = fileURLToPath(new URL('../fixtures/sample.rtf', import.meta.url))
const fixture = (extension: string): string =>
  fileURLToPath(new URL(`../fixtures/sample.${extension}`, import.meta.url))

function syntheticAst(
  type: OfficeParserAST['type'],
  content: OfficeParserAST['content']
): OfficeParserAST {
  return {
    type,
    content,
    config: {},
    metadata: {},
    attachments: [],
    warnings: [],
    auxiliary: {},
    toText: () => content.map((node) => node.text ?? '').join('\n'),
    to: async () => ({ value: '', messages: [] })
  } as OfficeParserAST
}

describe('OfficeParser extractor', () => {
  it('parses a real RTF fixture without OCR or network access', async () => {
    const bytes = await readFile(fixturePath)
    const result = await extractText({ path: fixturePath, type: 'rtf', bytes })
    expect(result.extractorVersion).toBe(`${officeParserExtractor.version}:rtf`)
    expect(result.text).toContain('OfficeParser Integration Test')
    expect(result.text).toContain('knowledge base')
    expect(result.sections).not.toHaveLength(0)
  })

  it.each<{
    type: SupportedDocumentType
    expectedText: string
    sourceKind: string
    minimumSections?: number
    sourceLabel?: string
  }>([
    { type: 'docx', expectedText: 'Knowledge Base Overview', sourceKind: 'section' },
    { type: 'pptx', expectedText: 'Retrieval Overview', sourceKind: 'slide', minimumSections: 2 },
    {
      type: 'xlsx',
      expectedText: 'Indexed documents',
      sourceKind: 'sheet',
      sourceLabel: 'Metrics'
    },
    { type: 'odt', expectedText: 'OpenDocument text fixture', sourceKind: 'section' },
    { type: 'odp', expectedText: 'Safety Boundary', sourceKind: 'slide', minimumSections: 2 },
    { type: 'ods', expectedText: 'Indexed documents', sourceKind: 'sheet', sourceLabel: 'Metrics' },
    { type: 'pdf', expectedText: 'Deterministic PDF evidence', sourceKind: 'page' },
    { type: 'epub', expectedText: 'EPUB chapter', sourceKind: 'chapter' }
  ])(
    'parses the real deterministic $type fixture',
    async ({ type, expectedText, sourceKind, minimumSections = 1, sourceLabel }) => {
      const path = fixture(type)
      const result = await extractText({ path, type, bytes: await readFile(path) })
      expect(result.text).toContain(expectedText)
      expect(result.sections.length).toBeGreaterThanOrEqual(minimumSections)
      expect(result.sections.some((section) => section.sourceKind === sourceKind)).toBe(true)
      if (sourceLabel)
        expect(result.sections.some((section) => section.sourceLabel === sourceLabel)).toBe(true)
    }
  )

  it('handles malformed content without exposing parser input', async () => {
    const secret = 'sensitive malformed fixture content'
    const result = await extractText({
      path: 'malformed.docx',
      type: 'docx',
      bytes: Buffer.from(secret)
    })
    expect(result.text).toBe('')
    expect(JSON.stringify(result.warnings)).not.toContain(secret)
  })

  it('enforces the configured archive expansion limit', async () => {
    const path = fileURLToPath(new URL('../fixtures/sample-archive-limit.docx', import.meta.url))
    await expect(extractText({ path, type: 'docx', bytes: await readFile(path) })).rejects.toThrow(
      'OfficeParser could not extract'
    )
  })

  it('maps pages, slides, and sheets to generalized source metadata', () => {
    const page = officeAstToExtraction(
      syntheticAst('pdf', [{ type: 'page', text: 'Page content', metadata: { pageNumber: 3 } }])
    )
    expect(page.sections[0]).toMatchObject({
      sourceKind: 'page',
      sourceIndex: 3
    })

    const slide = officeAstToExtraction(
      syntheticAst('pptx', [{ type: 'slide', text: 'Slide content', metadata: { slideNumber: 2 } }])
    )
    expect(slide.sections[0]).toMatchObject({
      sourceKind: 'slide',
      sourceIndex: 2
    })

    const sheet = officeAstToExtraction(
      syntheticAst('xlsx', [
        { type: 'sheet', text: 'Name | Value', metadata: { sheetName: 'Summary' } }
      ])
    )
    expect(sheet.sections[0]).toMatchObject({
      sourceKind: 'sheet',
      sourceIndex: 1,
      sourceLabel: 'Summary'
    })
  })

  it('groups document headings and EPUB chapters deterministically', () => {
    const docx = officeAstToExtraction(
      syntheticAst('docx', [
        { type: 'heading', text: 'Overview', metadata: { level: 1 } },
        { type: 'paragraph', text: 'Document content' }
      ])
    )
    expect(docx.sections[0]).toMatchObject({
      heading: 'Overview',
      sourceKind: 'section',
      sourceIndex: 1
    })

    const epub = officeAstToExtraction(
      syntheticAst('epub', [
        { type: 'heading', text: 'Chapter One', metadata: { level: 1 } },
        { type: 'paragraph', text: 'Chapter content' }
      ])
    )
    expect(epub.sections[0]).toMatchObject({
      sourceKind: 'chapter',
      sourceLabel: 'Chapter One'
    })
  })

  it('honors cancellation before parsing begins', async () => {
    const controller = new AbortController()
    controller.abort()
    const bytes = await readFile(fixturePath)
    await expect(
      extractText({ path: fixturePath, type: 'rtf', bytes, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('propagates cancellation while parsing is in flight', async () => {
    const parse = vi
      .spyOn(OfficeParser, 'parseOffice')
      .mockImplementation(async (_bytes, config) => {
        const options = typeof config === 'function' ? undefined : config
        return new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true }
          )
        })
      })
    const controller = new AbortController()
    const pending = extractText({
      path: fixturePath,
      type: 'rtf',
      bytes: await readFile(fixturePath),
      signal: controller.signal
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    parse.mockRestore()
  })
})
