import "dotenv/config"

/**
 * Centralized, validated runtime configuration.
 * Throws on boot if a required variable is missing so we never run half-configured.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim() !== "" ? value : fallback
}

export const config = {
  shopify: {
    apiKey: required("SHOPIFY_API_KEY"),
    apiSecret: required("SHOPIFY_API_SECRET"),
    // Read-only scopes only. This value is enforced, never widened at runtime.
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
    port: Number.parseInt(optional("PORT", "3000"), 10),
    nodeEnv: optional("NODE_ENV", "development"),
  },
} as const

export const isProd = config.server.nodeEnv === "production"

/** Scopes split into an array for comparison/validation. */
export const requestedScopes = config.shopify.scopes
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

// Hard guardrail: this product is read-only. Refuse to boot with any write scope.
const writeScope = requestedScopes.find((s) => s.startsWith("write_"))
if (writeScope) {
  throw new Error(
    `Read-only app cannot request write scopes. Remove "${writeScope}" from SHOPIFY_SCOPES.`,
  )
}
