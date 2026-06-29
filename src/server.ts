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

// Webhooks (RAW body must be first)
app.post(
  "/webhooks/:topicA/:topicB",
  express.raw({ type: "*/*" }),
  (req, res) => handleWebhook(req, res),
)

// JSON + cookies
app.use(express.json({ limit: "1mb" }))
app.use(cookieParser(config.security.sessionSecret))

// OAuth
app.get("/auth", beginAuth)
app.get("/auth/callback", handleCallback)

// Health
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" })
})

// Authenticated API
app.use("/api", verifySessionToken)
app.use("/api", ordersRouter)
app.use("/api", decisionsRouter)
app.use("/api", suppliersRouter)
app.use("/api", refreshRouter)

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server] error:", err)
    res.status(500).json({ error: "internal_error" })
  },
)

async function start(): Promise<void> {
  await runMigrations()

  app.listen(config.server.port, () => {
    console.log(`[server] running on :${config.server.port}`)
  })
}

start().catch((err) => {
  console.error("[server] fatal:", err)
  process.exit(1)
})
