/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const packageRequire = createRequire(import.meta.url)
const officeParserMain = packageRequire.resolve('officeparser')
const officeParserRequire = createRequire(officeParserMain)
const { strToU8, zipSync } = officeParserRequire('fflate')
const fixtures = fileURLToPath(new URL('../src/main/ingestion/fixtures/', import.meta.url))
const xml = (value) => strToU8(value)
const fixtureTimestamp = new Date('1980-01-01T00:00:00.000Z')

async function writeZip(name, entries) {
  await fs.writeFile(
    path.join(fixtures, name),
    zipSync(entries, { level: 6, mtime: fixtureTimestamp })
  )
}

await writeZip('sample.docx', {
  '[Content_Types].xml': xml(
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  ),
  '_rels/.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  ),
  'word/document.xml': xml(
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Knowledge Base Overview</w:t></w:r></w:p><w:p><w:r><w:t>Deterministic document content for local retrieval.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Topic</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Grounded</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`
  )
})

await writeZip('sample-archive-limit.docx', {
  '[Content_Types].xml': xml(
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  ),
  '_rels/.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  ),
  'word/document.xml': xml(
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${'A'.repeat(65 * 1024 * 1024)}</w:t></w:r></w:p></w:body></w:document>`
  )
})

await writeZip('sample.pptx', {
  '[Content_Types].xml': xml(
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
  ),
  '_rels/.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`
  ),
  'ppt/presentation.xml': xml(
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`
  ),
  'ppt/_rels/presentation.xml.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`
  ),
  'ppt/slides/slide1.xml': xml(
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr/><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Retrieval Overview</a:t></a:r></a:p><a:p><a:r><a:t>Grounded answers use indexed evidence.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  ),
  'ppt/slides/slide2.xml': xml(
    `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/><p:sp><p:nvSpPr/><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Safety Boundary</a:t></a:r></a:p><a:p><a:r><a:t>Retrieved text remains untrusted.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  )
})

await writeZip('sample.xlsx', {
  '[Content_Types].xml': xml(
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  ),
  '_rels/.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  ),
  'xl/workbook.xml': xml(
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Metrics" sheetId="1" r:id="rId1"/></sheets></workbook>`
  ),
  'xl/_rels/workbook.xml.rels': xml(
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  ),
  'xl/worksheets/sheet1.xml': xml(
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Metric</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Indexed documents</t></is></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>`
  )
})

const odfContent = (body) =>
  xml(
    `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" office:version="1.3"><office:body>${body}</office:body></office:document-content>`
  )
const manifest = (mime) =>
  xml(
    `<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`
  )
for (const [name, mime, body] of [
  [
    'sample.odt',
    'application/vnd.oasis.opendocument.text',
    '<office:text><text:h text:outline-level="1">Knowledge Base Overview</text:h><text:p>OpenDocument text fixture with grounded retrieval content.</text:p><text:list><text:list-item><text:p>First item</text:p></text:list-item><text:list-item><text:p>Second item</text:p></text:list-item></text:list></office:text>'
  ],
  [
    'sample.odp',
    'application/vnd.oasis.opendocument.presentation',
    '<office:presentation><draw:page draw:name="Slide 1"><draw:frame><draw:text-box><text:p>Retrieval Overview</text:p><text:p>Grounded answers use evidence.</text:p></draw:text-box></draw:frame></draw:page><draw:page draw:name="Slide 2"><draw:frame><draw:text-box><text:p>Safety Boundary</text:p><text:p>Retrieved content is untrusted.</text:p></draw:text-box></draw:frame></draw:page></office:presentation>'
  ],
  [
    'sample.ods',
    'application/vnd.oasis.opendocument.spreadsheet',
    '<office:spreadsheet><table:table table:name="Metrics"><table:table-row><table:table-cell office:value-type="string"><text:p>Metric</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Value</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>Indexed documents</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet>'
  ]
]) {
  await writeZip(name, {
    mimetype: [xml(mime), { level: 0 }],
    'META-INF/manifest.xml': manifest(mime),
    'content.xml': odfContent(body)
  })
}

await writeZip('sample.epub', {
  mimetype: [xml('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': xml(
    `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  ),
  'OEBPS/content.opf': xml(
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">pc-agent-fixture</dc:identifier><dc:title>PC Agent Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`
  ),
  'OEBPS/chapter.xhtml': xml(
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Grounded Retrieval</title></head><body><h1>Grounded Retrieval</h1><p>The EPUB chapter contains deterministic evidence.</p></body></html>`
  )
})

function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length 101 >>\nstream\nBT /F1 18 Tf 72 720 Td (Knowledge Base Overview) Tj 0 -30 Td /F1 12 Tf (Deterministic PDF evidence for retrieval.) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let result = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(result))
    result += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(result)
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  result += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return result
}

await fs.writeFile(path.join(fixtures, 'sample.pdf'), pdfFixture())
process.stdout.write('Generated deterministic Office/OpenDocument/PDF/EPUB fixtures.\n')
