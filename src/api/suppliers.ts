import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import {
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  upsertSupplier,
} from "../db/queries.js"

export const suppliersRouter = Router()

interface SupplierInput {
  name: unknown
  sku: unknown
  unitPrice: unknown
  deliveryDays: unknown
  confidence: unknown
}

function parseSupplier(body: SupplierInput):
  | { ok: true; value: { name: string; sku: string; unitPrice: number; deliveryDays: number; confidence: number } }
  | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const sku = typeof body.sku === "string" ? body.sku.trim() : ""
  const unitPrice = Number(body.unitPrice)
  const deliveryDays = body.deliveryDays === undefined ? 0 : Number(body.deliveryDays)
  const confidence = body.confidence === undefined ? 1 : Number(body.confidence)

  if (!name) return { ok: false, error: "name is required" }
  if (!sku) return { ok: false, error: "sku is required" }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, error: "unitPrice must be a non-negative number" }
  }

  if (!Number.isFinite(deliveryDays) || deliveryDays < 0) {
    return { ok: false, error: "deliveryDays must be a non-negative number" }
  }

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "confidence must be between 0 and 1" }
  }

  return { ok: true, value: { name, sku, unitPrice, deliveryDays, confidence } }
}

function parseId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null
  return Number(id)
}

function serialize(row: {
  id: number
  name: string
  sku: string
  unit_price: string | number | null
  delivery_days: number | null
  confidence: string | number | null
}) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unitPrice: row.unit_price ? Number(row.unit_price) : 0,
    deliveryDays: row.delivery_days ?? 0,
    confidence: row.confidence ? Number(row.confidence) : 0,
  }
}

/** GET /api/suppliers */
suppliersRouter.get("/suppliers", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const rows = await listSuppliers(req.shop.id)
    return res.json(rows.map(serialize))
  } catch (err) {
    console.error("[suppliers] list error:", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

/** POST /api/suppliers */
suppliersRouter.post("/suppliers", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const parsed = parseSupplier(req.body as SupplierInput)
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error })
  }

  try {
    const row = await upsertSupplier({ shopId: req.shop.id, ...parsed.value })
    return res.status(201).json(serialize(row))
  } catch (err) {
    console.error("[suppliers] create error:", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

/** PUT /api/suppliers/:id */
suppliersRouter.put("/suppliers/:id", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const supplierId = parseId(req.params.id)
  if (!supplierId) {
    return res.status(400).json({ error: "Invalid supplier id" })
  }

  const parsed = parseSupplier(req.body as SupplierInput)
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error })
  }

  try {
    const row = await updateSupplier(req.shop.id, supplierId, parsed.value)

    if (!row) {
      return res.status(404).json({ error: "Supplier not found" })
    }

    return res.json(serialize(row))
  } catch (err) {
    console.error("[suppliers] update error:", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

/** DELETE /api/suppliers/:id */
suppliersRouter.delete("/suppliers/:id", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const supplierId = parseId(req.params.id)
  if (!supplierId) {
    return res.status(400).json({ error: "Invalid supplier id" })
  }

  try {
    const removed = await deleteSupplier(req.shop.id, supplierId)

    if (!removed) {
      return res.status(404).json({ error: "Supplier not found" })
    }

    return res.status(204).send()
  } catch (err) {
    console.error("[suppliers] delete error:", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})
