import pg from "pg"
import { config, isProd } from "../config.js"

const { Pool } = pg

/**
 * Single shared connection pool for the whole process.
 * Managed Postgres providers (Neon/Render/Railway) require TLS in production.
 */
export const pool = new Pool({
  connectionString: config.db.url,
  ssl: isProd ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (err) => {
  console.error("[v0] Unexpected idle Postgres client error:", err)
})

/** Typed query helper so callers always get back rows of a known shape. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as any[])
}

/** Runs a set of statements inside a single transaction. */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}
