import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const packagedRequire = createRequire(import.meta.url)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  const appArchive = path.join(path.dirname(process.execPath), 'resources', 'app.asar')
  const { connect } = packagedRequire(
    path.join(appArchive, 'node_modules', '@tursodatabase', 'database')
  )
  const { OfficeParser } = packagedRequire(path.join(appArchive, 'node_modules', 'officeparser'))
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-agent-packaged-smoke-'))
  try {
    const database = await connect(path.join(folder, 'smoke.db'))
    await database.exec("CREATE TABLE smoke(value TEXT); INSERT INTO smoke VALUES ('native-ok');")
    assert.deepEqual(await database.get('SELECT value FROM smoke'), { value: 'native-ok' })
    await database.close()

    const rtf = Buffer.from(
      String.raw`{\rtf1\ansi\deff0 {\fonttbl {\f0 Arial;}}\f0\fs24 Packaged parser smoke test.}`
    )
    const ast = await OfficeParser.parseOffice(rtf, { fileType: 'rtf', ocr: false })
    assert.match(ast.toText(), /Packaged parser smoke test/)
    process.stdout.write('Packaged Turso and OfficeParser smoke test passed.\n')
  } finally {
    await fs.rm(folder, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
