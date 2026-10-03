import { connect } from '@tursodatabase/database'
import type { Database } from '@tursodatabase/database'
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { runMigrations } from './migrations'

export class DatabaseService {
  private database: Database | null = null

  constructor(readonly path: string) {}

  /** Opens the one application database and applies all pending migrations. */
  async open(): Promise<Database> {
    if (this.database) return this.database
    if (this.path !== ':memory:') await mkdir(dirname(this.path), { recursive: true })

    let database: Database | undefined
    try {
      database = await connect(this.path)
      await runMigrations(database)
      this.database = database
      return database
    } catch (error) {
      if (database) await database.close().catch(() => undefined)
      throw new Error(`Could not open or migrate the knowledge base at ${this.path}.`, {
        cause: error
      })
    }
  }

  /** Returns the open database without exposing it outside the main process. */
  get connection(): Database {
    if (!this.database) throw new Error('The knowledge-base database is not open.')
    return this.database
  }

  /** Closes the connection. Calling close repeatedly is safe. */
  async close(): Promise<void> {
    const database = this.database
    this.database = null
    if (database) await database.close()
  }
}
