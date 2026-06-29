import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { pool } from "./pool.js"

/**
 * Applies migrate.sql against the configured database.
 * Idempotent migrations (safe to rerun).
 */
export async function runMigrations(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = await readFile(join(here, "migrate.sql"), "utf8")

  console.log("[migrate] Starting database migrations...")

  const client = await pool.connect()

  try {
    await client.query("BEGIN")
    await client.query(sql)
    await client.query("COMMIT")

    console.log("[migrate] Migrations completed successfully.")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("[migrate] Migration failed, rollback executed.")
    throw err
  } finally {
    client.release()
  }
}

// CLI runner safety
const isDirectRun = fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  runMigrations()
    .then(async () => {
      await pool.end()
      process.exit(0)
    })
    .catch(async (err) => {
      console.error("[migrate] Fatal error:", err)
      await pool.end().catch(() => {})
      process.exit(1)
    })
}
