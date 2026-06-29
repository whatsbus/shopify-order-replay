import crypto from "node:crypto"
import { config } from "../config.js"

/**
 * AES-256-GCM encryption for access tokens at rest.
 * Stored format: base64(iv).base64(authTag).base64(ciphertext)
 */

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12

/** Derive a stable 32-byte key from the configured secret. */
function getKey(): Buffer {
  return crypto.createHash("sha256").update(config.security.tokenEncryptionKey).digest()
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".")
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted token")
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

/** Timing-safe comparison for HMAC and other secret comparisons. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}
