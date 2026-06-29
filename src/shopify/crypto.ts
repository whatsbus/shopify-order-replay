import crypto from "node:crypto"
import { config } from "../config.js"

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12

function getKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(String(config.security.tokenEncryptionKey))
    .digest()
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".")
}

export function decryptToken(payload: string): string {
  const parts = payload.split(".")

  if (parts.length !== 3) {
    throw new Error("Malformed encrypted token")
  }

  const [ivB64, tagB64, dataB64] = parts

  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const data = Buffer.from(dataB64, "base64")

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  if (bufA.length !== bufB.length) return false

  return crypto.timingSafeEqual(bufA, bufB)
}
