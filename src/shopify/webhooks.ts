import crypto from "node:crypto"
import type { Request, Response } from "express"
import { config } from "../config.js"
import { safeEqual } from "./crypto.js"
import { deleteShop } from "../db/queries.js"

/**
 * Webhook handling: mandatory GDPR compliance topics + app/uninstalled.
 *
 * HMAC verification requires the RAW request body, so the routes that mount
 * these handlers MUST use express.raw() (see server.ts). We verify the
 * X-Shopify-Hmac-Sha256 header against the raw bytes before doing anything.
 */

const WEBHOOK_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "app/uninstalled",
] as const

/** Verify the webhook HMAC against the raw body buffer. */
export function verifyWebhookHmac(req: Request): boolean {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256")
  if (!hmacHeader) return false
  const rawBody = req.body as Buffer
  if (!Buffer.isBuffer(rawBody)) return false
  const digest = crypto
    .createHmac("sha256", config.shopify.apiSecret)
    .update(rawBody)
    .digest("base64")
  return safeEqual(digest, hmacHeader)
}

/**
 * Single entry point for all webhook topics.
 * Returns 401 on bad HMAC, 200 otherwise (Shopify requires fast 200s).
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyWebhookHmac(req)) {
    res.status(401).send("HMAC validation failed")
    return
  }

  const topic = req.get("X-Shopify-Topic") ?? ""
  const shopDomain = req.get("X-Shopify-Shop-Domain") ?? ""

  // Acknowledge immediately; do the work after responding.
  res.status(200).send("ok")

  try {
    switch (topic) {
      case "customers/data_request":
        // This app stores no personal customer data (orders are aggregated
        // for supplier cost analysis only). Nothing to compile.
        console.log(`[v0] customers/data_request for ${shopDomain}: no PII stored.`)
        break

      case "customers/redact":
        // No per-customer PII retained, so there is nothing to redact.
        console.log(`[v0] customers/redact for ${shopDomain}: no PII to redact.`)
        break

      case "shop/redact":
        // 48h after uninstall: purge all data for this shop.
        await deleteShop(shopDomain)
        console.log(`[v0] shop/redact: purged all data for ${shopDomain}.`)
        break

      case "app/uninstalled":
        // Remove the shop (cascades orders/suppliers/decision logs + token).
        await deleteShop(shopDomain)
        console.log(`[v0] app/uninstalled: removed ${shopDomain}.`)
        break

      default:
        console.warn(`[v0] Unhandled webhook topic: ${topic}`)
    }
  } catch (err) {
    console.error(`[v0] Error processing webhook ${topic} for ${shopDomain}:`, err)
  }
}

/**
 * Register webhook subscriptions after install.
 * Uses the REST Admin API webhook endpoint (read scopes are sufficient to
 * create webhook subscriptions; this is not a data mutation on store objects).
 */
export async function registerWebhooks(shop: string, accessToken: string): Promise<void> {
  const base = `https://${shop}/admin/api/${config.shopify.apiVersion}`
  for (const topic of WEBHOOK_TOPICS) {
    const address = `${config.shopify.appUrl}/webhooks/${topic}`
    const res = await fetch(`${base}/webhooks.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    })
    if (!res.ok && res.status !== 422) {
      // 422 = already exists, which is fine.
      console.error(`[v0] Failed to register webhook ${topic}: HTTP ${res.status}`)
    }
  }
}
