import express from "express"
import cookieParser from "cookie-parser"
import { config } from "./config.js"
import { beginAuth, handleCallback } from "./shopify/oauth.js"
import { handleWebhook } from "./shopify/webhooks.js"
import { verifySessionToken } from "./shopify/session.js"
import { ordersRouter } from "./api/orders.js"
import { decisionsRouter } from "./api/decisions.js"
import { suppliersRouter } from "./api/suppliers.js"
import { refreshRouter } from "./api/refresh.js"
import { runMigrations } from "./db/migrate.js"

const app = express()
app.disable("x-powered-by")

// --- Webhooks: must read the RAW body for HMAC verification. Mount BEFORE
//     the JSON body parser so express.raw() captures the bytes. ---
app.post(
  "/webhooks/:topicA/:topicB",
  express.raw({ type: "*/*" }),
  (req, res) => {
    // Reconstruct topic from path for clarity (e.g. customers/redact).
    handleWebhook(req, res)
  },
)

// --- Standard middleware for everything else ---
app.use(express.json({ limit: "1mb" }))
app.use(cookieParser(config.security.sessionSecret))

// --- OAuth (no session token yet) ---
app.get("/auth", beginAuth)
app.get("/auth/callback", handleCallback)

// --- Health check ---
app.get("/healthz", (_req, res) => res.json({ status: "ok" }))

// --- Authenticated API (App Bridge session token required, tenant-scoped) ---
app.use("/api", verifySessionToken, ordersRouter)
app.use("/api", verifySessionToken, decisionsRouter)
app.use("/api", verifySessionToken, suppliersRouter)
app.use("/api", verifySessionToken, refreshRouter)

// --- Catch-all error handler ---
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error("[v0] Unhandled error:", err)
    res.status(500).json({ error: "Internal server error" })
  },
)

async function start(): Promise<void> {
  // Apply schema on boot so a fresh deploy is immediately usable.
  await runMigrations()
  app.listen(config.server.port, () => {
    console.log(`[v0] Decision Replay Engine listening on :${config.server.port}`)
  })
}

start().catch((err) => {
  console.error("[v0] Failed to start server:", err)
  process.exit(1)
})
