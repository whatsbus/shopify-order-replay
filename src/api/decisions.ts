import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import { getDecisionLogByOrder } from "../db/queries.js"

/**
 * Decision log endpoint: returns the explainable trace for one order.
 * Tenant-scoped via req.shop.
 */
export const decisionsRouter = Router()

/** GET /api/decision/:orderId -> decision log + JSONB trace. */
decisionsRouter.get("/decision/:orderId", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const orderId = Number.parseInt(req.params.orderId, 10)
  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: "Invalid order id" })
    return
  }

  const log = await getDecisionLogByOrder(shop.id, orderId)
  if (!log) {
    res.status(404).json({ error: "No decision log for this order. Run a refresh first." })
    return
  }

  res.json({
    orderId: log.order_id,
    missedSavings: Number.parseFloat(log.missed_savings),
    currency: log.currency,
    engineVersion: log.engine_version,
    createdAt: log.created_at,
    trace: log.trace,
  })
})
