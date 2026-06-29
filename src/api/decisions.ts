import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import { getDecisionLogByOrder } from "../db/queries.js"

export const decisionsRouter = Router()

decisionsRouter.get("/decision/:orderId", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const shop = req.shop

  if (!/^\d+$/.test(req.params.orderId)) {
    return res.status(400).json({ error: "Invalid order id" })
  }

  const orderId = Number(req.params.orderId)

  try {
    const log = await getDecisionLogByOrder(shop.id, orderId)

    if (!log) {
      return res.status(404).json({ error: "No decision log for this order. Run a refresh first." })
    }

    return res.json({
      orderId: log.order_id,
      missedSavings: log.missed_savings ? Number.parseFloat(log.missed_savings) : 0,
      currency: log.currency,
      engineVersion: log.engine_version,
      createdAt: log.created_at,
      trace: log.trace,
    })
  } catch (err) {
    console.error("decision log error", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})
