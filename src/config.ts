import "dotenv/config"

function required(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    throw new Error(`Missing env: ${name}`)
  }
  return v
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]
  return v && v.trim() ? v : fallback
}

export const config = {
  shopify: {
    apiKey: required("SHOPIFY_API_KEY"),
    apiSecret: required("SHOPIFY_API_SECRET"),
    scopes: optional("SHOPIFY_SCOPES", "read_orders,read_products"),
    appUrl: required("SHOPIFY_APP_URL").replace(/\/$/, ""),
    apiVersion: optional("SHOPIFY_API_VERSION", "2024-10"),
  },

  db: {
    url: required("DATABASE_URL"),
  },

  security: {
    tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"),
    sessionSecret: required("SESSION_SECRET"),
  },

  server: {
    port: Number(optional("PORT", "3000")),
    nodeEnv: optional("NODE_ENV", "development"),
  },
} as const

export const isProd = config.server.nodeEnv === "production"

export const requestedScopes = config.shopify.scopes
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

const hasWriteScope = requestedScopes.some((s) => s.startsWith("write_"))

if (hasWriteScope) {
  throw new Error("Read-only app: write scopes not allowed")
}
