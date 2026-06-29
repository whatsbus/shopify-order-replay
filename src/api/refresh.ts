import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import { syncOrdersForShop } from "../services/orderSync.js"
import { replayAllAndStore, type OrderSnapshotRow, type SupplierRow } from "../db/queries.js"
import { replay } from "../replay/replay.js"
import { DEFAULT_REPLAY_CONFIG, type SupplierOffer } from "../replay/types.js"

/**
 * POST /api/refresh
 *
 * One action that (1) re-syncs the latest orders read-only from Shopify, then
 * (2) replays every order against the current supplier set and stores a
 * decision log per order. Returns updated counters for the dashboard.
 */
export const refreshRouter = Router()

function toOffer(row: SupplierRow): SupplierOffer {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unit_price: Number.parseFloat(row.unit_price),
    delivery_days: row.delivery_days,
    confidence: Number.parseFloat(row.confidence),
  }
}

refreshRouter.post("/refresh", async (req: AuthedRequest, res: Response) => {
  const shop = req.shop!

  // 1. Read-only ingestion of latest orders.
  let synced = 0
  try {
    const result = await syncOrdersForShop(shop)
    synced = result.synced
  } catch (err) {
    console.error("[v0] Refresh sync failed:", err)
    res.status(502).json({ error: "Failed to sync orders from Shopify." })
    return
  }

  // 2. Replay all orders and persist decision logs in one transaction.
  const { ordersReplayed, totalMissedSavings } = await replayAllAndStore(
    shop.id,
    (order: OrderSnapshotRow, suppliers: SupplierRow[]) => {
      const offers = suppliers.map(toOffer)
      const result = replay(
        { id: order.id, currency: order.currency, line_items: order.line_items },
        offers,
        DEFAULT_REPLAY_CONFIG,
      )
      return {
        missedSavings: result.missed_savings,
        trace: result.trace,
        currency: result.currency,
        engineVersion: result.engine_version,
      }
    },
  )

  res.json({
    ordersSynced: synced,
    ordersReplayed,
    totalMissedSavings,
  })
})
