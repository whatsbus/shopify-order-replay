import crypto from "node:crypto"
import type { Request, Response } from "express"
import { config } from "../config.js"
import { safeEqual } from "./crypto.js"
import { deleteShop } from "../db/queries.js"

const WEBHOOK_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "app/uninstalled",
] as const

export function verifyWebhookHmac(req: Request): boolean {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256")
  if (!hmacHeader) return false

  const rawBody = req.body
  if (!Buffer.isBuffer(rawBody)) return false

  const digest = crypto
    .createHmac("sha256", config.shopify.apiSecret)
    .update(rawBody)
    .digest("base64")

  return safeEqual(digest, hmacHeader)
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  if (!verifyWebhookHmac(req)) {
    res.status(401).send("Invalid HMAC")
    return
  }

  const topic = req.get("X-Shopify-Topic") ?? ""
  const shopDomain = req.get("X-Shopify-Shop-Domain") ?? ""

  res.status(200).send("ok")

  try {
    switch (topic) {
      case "customers/data_request":
      case "customers/redact":
        break

      case "shop/redact":
      case "app/uninstalled":
        await deleteShop(shopDomain)
        break

      default:
        break
    }
  } catch (err) {
    console.error("[webhook] error:", err)
  }
}

export async function registerWebhooks(
  shop: string,
  accessToken: string,
): Promise<void> {
  const base = `https://${shop}/admin/api/${config.shopify.apiVersion}`

  for (const topic of WEBHOOK_TOPICS) {
    const address = `${config.shopify.appUrl}/webhooks/${topic}`

    try {
      const res = await fetch(`${base}/webhooks.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          webhook: { topic, address, format: "json" },
        }),
      })

      if (!res.ok && res.status !== 422) {
        console.error(`[webhook] failed ${topic}: ${res.status}`)
      }
    } catch (err) {
      console.error(`[webhook] error registering ${topic}:`, err)
    }
  }
}
