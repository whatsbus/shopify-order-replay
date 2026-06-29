import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import {
  getOrderSnapshot,
  getSummary,
  listOrdersWithSavings,
} from "../db/queries.js"

/**
 * Order + summary endpoints for the dashboard.
 * All routes are tenant-scoped via req.shop (set by verifySessionToken).
 */
export const ordersRouter = Router()

/** GET /api/summary -> KPI header values. */
ordersRouter.get("/summary", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const summary = await getSummary(shop.id)
  res.json({
    totalMissedSavings: Number.parseFloat(summary.total_missed_savings),
    ordersAnalyzed: Number.parseInt(summary.orders_analyzed, 10),
    totalOrders: Number.parseInt(summary.total_orders, 10),
    currency: summary.currency,
    lastSyncedAt: shop.last_synced_at,
  })
})

/** GET /api/orders -> order list with per-order missed savings. */
ordersRouter.get("/orders", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const rows = await listOrdersWithSavings(shop.id)
  res.json(
    rows.map((r) => ({
      id: r.id,
      shopifyOrderId: r.shopify_order_id,
      orderName: r.order_name,
      processedAt: r.processed_at,
      currency: r.currency,
      totalActualCost: Number.parseFloat(r.total_actual_cost),
      missedSavings: r.missed_savings ? Number.parseFloat(r.missed_savings) : 0,
      hasDecision: r.has_decision,
    })),
  )
})

/** GET /api/orders/:id -> a single order snapshot with its line items. */
ordersRouter.get("/orders/:id", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!
  const orderId = Number.parseInt(req.params.id, 10)
  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: "Invalid order id" })
    return
  }
  const order = await getOrderSnapshot(shop.id, orderId)
  if (!order) {
    res.status(404).json({ error: "Order not found" })
    return
  }
  res.json({
    id: order.id,
    shopifyOrderId: order.shopify_order_id,
    orderName: order.order_name,
    processedAt: order.processed_at,
    currency: order.currency,
    totalActualCost: Number.parseFloat(order.total_actual_cost),
    lineItems: order.line_items,
  })
})
