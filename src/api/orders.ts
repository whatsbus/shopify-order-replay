import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import {
  getOrderSnapshot,
  getSummary,
  listOrdersWithSavings,
} from "../db/queries.js"

export const ordersRouter = Router()

/** GET /api/summary -> KPI header values. */
ordersRouter.get("/summary", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const shop = req.shop
    const summary = await getSummary(shop.id)

    return res.json({
      totalMissedSavings: summary.total_missed_savings
        ? Number.parseFloat(summary.total_missed_savings)
        : 0,
      ordersAnalyzed: summary.orders_analyzed
        ? Number.parseInt(summary.orders_analyzed, 10)
        : 0,
      totalOrders: summary.total_orders
        ? Number.parseInt(summary.total_orders, 10)
        : 0,
      currency: summary.currency,
      lastSyncedAt: shop.last_synced_at,
    })
  } catch (err) {
    console.error("summary error", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

/** GET /api/orders -> order list with per-order missed savings. */
ordersRouter.get("/orders", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const shop = req.shop
    const rows = await listOrdersWithSavings(shop.id)

    return res.json(
      rows.map((r) => ({
        id: r.id,
        shopifyOrderId: r.shopify_order_id,
        orderName: r.order_name,
        processedAt: r.processed_at,
        currency: r.currency,
        totalActualCost: r.total_actual_cost
          ? Number.parseFloat(r.total_actual_cost)
          : 0,
        missedSavings: r.missed_savings
          ? Number.parseFloat(r.missed_savings)
          : 0,
        hasDecision: r.has_decision,
      })),
    )
  } catch (err) {
    console.error("orders list error", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})

/** GET /api/orders/:id -> a single order snapshot with its line items. */
ordersRouter.get("/orders/:id", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid order id" })
  }

  const shop = req.shop
  const orderId = Number(req.params.id)

  try {
    const order = await getOrderSnapshot(shop.id, orderId)

    if (!order) {
      return res.status(404).json({ error: "Order not found" })
    }

    return res.json({
      id: order.id,
      shopifyOrderId: order.shopify_order_id,
      orderName: order.order_name,
      processedAt: order.processed_at,
      currency: order.currency,
      totalActualCost: order.total_actual_cost
        ? Number.parseFloat(order.total_actual_cost)
        : 0,
      lineItems: order.line_items,
    })
  } catch (err) {
    console.error("order snapshot error", err)
    return res.status(500).json({ error: "Internal server error" })
  }
})
