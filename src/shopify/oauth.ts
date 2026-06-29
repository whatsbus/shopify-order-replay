import crypto from "node:crypto"
import type { Request, Response } from "express"
import { config } from "../config.js"
import { encryptToken, safeEqual } from "./crypto.js"
import { upsertShop } from "../db/queries.js"
import { registerWebhooks } from "./webhooks.js"
import { runInitialSync } from "../services/orderSync.js"

/**
 * Shopify OAuth 2.0 install flow (offline access token).
 *
 *   GET /auth?shop=foo.myshopify.com   -> redirect to Shopify consent screen
 *   GET /auth/callback                 -> verify, exchange code, store token
 */

const STATE_COOKIE = "shopify_oauth_state"
const SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/

function isValidShop(shop: unknown): shop is string {
  return typeof shop === "string" && SHOP_REGEX.test(shop)
}

/** Verify the HMAC on a Shopify OAuth/callback query string. */
function verifyOAuthHmac(query: Record<string, unknown>): boolean {
  const { hmac, signature, ...rest } = query as Record<string, string>
  if (!hmac) return false
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("&")
  const digest = crypto
    .createHmac("sha256", config.shopify.apiSecret)
    .update(message)
    .digest("hex")
  return safeEqual(digest, hmac)
}

/** Step 1: begin install. Redirect merchant to Shopify's consent screen. */
export function beginAuth(req: Request, res: Response): void {
  const shop = req.query.shop
  if (!isValidShop(shop)) {
    res.status(400).send("Missing or invalid 'shop' parameter.")
    return
  }

  const state = crypto.randomBytes(16).toString("hex")
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.server.nodeEnv === "production",
    sameSite: "lax",
    signed: true,
    maxAge: 10 * 60 * 1000,
  })

  const redirectUri = `${config.shopify.appUrl}/auth/callback`
  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(config.shopify.apiKey)}` +
    `&scope=${encodeURIComponent(config.shopify.scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`

  res.redirect(authUrl)
}

/** Step 2: callback. Validate everything, exchange code, persist token. */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { shop, code, state } = req.query as Record<string, string>

  if (!isValidShop(shop)) {
    res.status(400).send("Invalid shop.")
    return
  }
  if (!verifyOAuthHmac(req.query as Record<string, unknown>)) {
    res.status(401).send("HMAC validation failed.")
    return
  }
  const expectedState = req.signedCookies?.[STATE_COOKIE]
  if (!state || !expectedState || !safeEqual(state, expectedState)) {
    res.status(403).send("State validation failed.")
    return
  }

  // Exchange authorization code for an offline access token.
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.shopify.apiKey,
      client_secret: config.shopify.apiSecret,
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error("[v0] Token exchange failed:", tokenRes.status)
    res.status(502).send("Failed to obtain access token.")
    return
  }

  const tokenJson = (await tokenRes.json()) as { access_token: string; scope: string }

  const shopRow = await upsertShop({
    shopDomain: shop,
    encryptedToken: encryptToken(tokenJson.access_token),
    scopes: tokenJson.scope,
  })

  res.clearCookie(STATE_COOKIE)

  // Register mandatory webhooks and kick off an initial read-only sync.
  // Failures here should not block the install redirect.
  try {
    await registerWebhooks(shop, tokenJson.access_token)
  } catch (err) {
    console.error("[v0] Webhook registration failed:", err)
  }
  runInitialSync(shopRow.id, shop, tokenJson.access_token).catch((err) =>
    console.error("[v0] Initial sync failed:", err),
  )

  // Redirect into the embedded app inside Shopify admin.
  const host = req.query.host as string | undefined
  const embeddedUrl =
    `https://${shop}/admin/apps/${config.shopify.apiKey}` +
    (host ? `?host=${encodeURIComponent(host)}` : "")
  res.redirect(embeddedUrl)
}
