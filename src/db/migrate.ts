import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { pool } from "./pool.js"

/**
 * Applies migrate.sql against the configured database.
 * Run via `pnpm migrate`. The SQL is idempotent, so reruns are safe.
 */
export async function runMigrations(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = await readFile(join(here, "migrate.sql"), "utf8")
  console.log("[v0] Running database migrations...")
  await pool.query(sql)
  console.log("[v0] Migrations complete.")
}

// Allow running directly: `tsx src/db/migrate.ts`
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[v0] Migration failed:", err)
      process.exit(1)
    })
}
