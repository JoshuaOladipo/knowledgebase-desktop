import { fileURLToPath } from 'node:url'
import type { OfficeParserAST } from 'officeparser'
import { describe, expect, it } from 'vitest'
import { extractText } from '../extractText'
import { officeAstToExtraction, officeParserExtractor } from './officeParser'

const fixturePath = fileURLToPath(new URL('../fixtures/sample.rtf', import.meta.url))

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
    const result = await extractText({ path: fixturePath, type: 'rtf' })
    expect(result.extractorVersion).toBe(`${officeParserExtractor.version}:rtf`)
    expect(result.text).toContain('OfficeParser Integration Test')
    expect(result.text).toContain('knowledge base')
    expect(result.sections).not.toHaveLength(0)
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
    await expect(
      extractText({ path: fixturePath, type: 'rtf', signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
