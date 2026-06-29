import pg from "pg"
import { config, isProd } from "../config.js"

const { Pool } = pg

/**
 * Global Postgres pool
 */
export const pool = new Pool({
  connectionString: config.db.url,
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (err) => {
  console.error("[db] Unexpected Postgres pool error:", err)
})

/**
 * Typed query helper
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  try {
    return await pool.query<T>(text, params as any[])
  } catch (err) {
    console.error("[db] Query error:", { text, params, err })
    throw err
  }
}

/**
 * Safe transaction helper (prevents double rollback crash)
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()

  let finished = false

  try {
    await client.query("BEGIN")

    const result = await fn(client)

    await client.query("COMMIT")
    finished = true

    return result
  } catch (err) {
    if (!finished) {
      try {
        await client.query("ROLLBACK")
      } catch (rollbackErr) {
        console.error("[db] rollback failed:", rollbackErr)
      }
    }

    console.error("[db] transaction error:", err)
    throw err
  } finally {
    client.release()
  }
}
