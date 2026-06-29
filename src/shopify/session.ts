import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import { config } from "../config.js"
import { getShopByDomain, type ShopRow } from "../db/queries.js"

export interface AuthedRequest extends Request {
  shop?: ShopRow
  shopDomain?: string
}

interface SessionTokenPayload extends jwt.JwtPayload {
  dest: string
  aud: string
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization
  if (!header) return null
  if (!header.startsWith("Bearer ")) return null
  return header.slice(7).trim()
}

function shopFromDest(dest: string): string | null {
  try {
    return new URL(dest).host
  } catch {
    return null
  }
}

export async function verifySessionToken(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearer(req)

  if (!token) {
    res.status(401).json({ error: "Missing session token" })
    return
  }

  let payload: SessionTokenPayload

  try {
    payload = jwt.verify(token, config.shopify.apiSecret, {
      algorithms: ["HS256"],
      audience: config.shopify.apiKey,
    }) as SessionTokenPayload
  } catch {
    res.status(401).json({ error: "Invalid session token" })
    return
  }

  const shopDomain = shopFromDest(payload.dest)

  if (!shopDomain) {
    res.status(401).json({ error: "Invalid token dest" })
    return
  }

  const shop = await getShopByDomain(shopDomain)

  if (!shop) {
    res.status(401).json({ error: "Shop not installed" })
    return
  }

  req.shop = shop
  req.shopDomain = shopDomain

  next()
}
