import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import {
  deleteSupplier,
  listSuppliers,
  updateSupplier,
  upsertSupplier,
} from "../db/queries.js"

/**
 * Supplier CRUD. This is the manual MVP input for alternative supplier offers.
 * Tenant-scoped via req.shop.
 */
export const suppliersRouter = Router()

interface SupplierInput {
  name: unknown
  sku: unknown
  unitPrice: unknown
  deliveryDays: unknown
  confidence: unknown
}

/** Validate + coerce a supplier payload. Returns an error string or values. */
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

function serialize(row: {
  id: number
  name: string
  sku: string
  unit_price: string
  delivery_days: number
  confidence: string
}) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unitPrice: Number.parseFloat(row.unit_price),
    deliveryDays: row.delivery_days,
    confidence: Number.parseFloat(row.confidence),
  }
}

/** GET /api/suppliers */
suppliersRouter.get("/suppliers", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const rows = await listSuppliers(shop.id)
  res.json(rows.map(serialize))
})

/** POST /api/suppliers */
suppliersRouter.post("/suppliers", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const parsed = parseSupplier(req.body as SupplierInput)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const row = await upsertSupplier({ shopId: shop.id, ...parsed.value })
  res.status(201).json(serialize(row))
})

/** PUT /api/suppliers/:id */
suppliersRouter.put("/suppliers/:id", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const supplierId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(supplierId)) {
    res.status(400).json({ error: "Invalid supplier id" })
    return
  }
  const parsed = parseSupplier(req.body as SupplierInput)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const row = await updateSupplier(shop.id, supplierId, parsed.value)
  if (!row) {
    res.status(404).json({ error: "Supplier not found" })
    return
  }
  res.json(serialize(row))
})

/** DELETE /api/suppliers/:id */
suppliersRouter.delete("/suppliers/:id", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const supplierId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(supplierId)) {
    res.status(400).json({ error: "Invalid supplier id" })
    return
  }
  const removed = await deleteSupplier(shop.id, supplierId)
  if (!removed) {
    res.status(404).json({ error: "Supplier not found" })
    return
  }
  res.status(204).send()
})
