/* eslint-disable @typescript-eslint/explicit-function-return-type */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { connect } from '@tursodatabase/database'

const checkpoints = [10_000, 50_000, 100_000]
const dimensions = 384
const queryVector = JSON.stringify(
  Array.from({ length: dimensions }, (_, index) => (index === 0 ? 1 : 0))
)

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

async function insertBatch(database, offset, count) {
  const insert = database.transactionAsync(async (transaction) => {
    for (let index = 0; index < count; index += 1) {
      const ordinal = offset + index
      await transaction.run(
        `INSERT INTO chunks(
          id, document_id, ordinal, content, token_count, start_offset, end_offset,
          embedding, embedding_provider, embedding_model, embedding_dimensions
        ) VALUES (?, 'document', ?, 'synthetic benchmark evidence', 3, 0, 28,
                  vector32(?), 'local', 'token-hash-v1', ?)`,
        `chunk-${ordinal}`,
        ordinal,
        queryVector,
        dimensions
      )
    }
  })
  await insert.immediate()
}

async function retrieve(database) {
  return database.all(
    `SELECT c.id, vector_distance_cos(c.embedding, vector32(?)) AS distance
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'indexed' AND c.embedding_provider = 'local'
       AND c.embedding_model = 'token-hash-v1' AND c.embedding_dimensions = ?
     ORDER BY distance ASC, c.id ASC LIMIT 20`,
    queryVector,
    dimensions
  )
}

async function main() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-agent-retrieval-benchmark-'))
  const databasePath = path.join(folder, 'benchmark.db')
  const database = await connect(databasePath)
  try {
    await database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE documents(id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE chunks(
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        content TEXT NOT NULL, token_count INTEGER NOT NULL, start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL, embedding BLOB NOT NULL, embedding_provider TEXT NOT NULL,
        embedding_model TEXT NOT NULL, embedding_dimensions INTEGER NOT NULL
      );
      INSERT INTO documents(id, status) VALUES ('document', 'indexed');
    `)
    const results = []
    let inserted = 0
    for (const checkpoint of checkpoints) {
      const insertStartedAt = performance.now()
      while (inserted < checkpoint) {
        const count = Math.min(1_000, checkpoint - inserted)
        await insertBatch(database, inserted, count)
        inserted += count
      }
      const insertionMs = performance.now() - insertStartedAt
      await retrieve(database)
      const latencies = []
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const startedAt = performance.now()
        const rows = await retrieve(database)
        if (rows.length !== 20) throw new Error('Benchmark retrieval returned an invalid result.')
        latencies.push(performance.now() - startedAt)
      }
      const databaseBytes = (await fs.stat(databasePath)).size
      results.push({
        chunks: checkpoint,
        dimensions,
        insertionMs: Math.round(insertionMs * 100) / 100,
        retrievalMedianMs: Math.round(percentile(latencies, 0.5) * 100) / 100,
        retrievalP95Ms: Math.round(percentile(latencies, 0.95) * 100) / 100,
        databaseBytes,
        residentSetBytes: process.memoryUsage().rss
      })
    }
    process.stdout.write(
      `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`
    )
  } finally {
    await database.close()
    await fs.rm(folder, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
