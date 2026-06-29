import { Router } from "express"
import type { Response } from "express"
import type { AuthedRequest } from "../shopify/session.js"
import { syncOrdersForShop } from "../services/orderSync.js"
import {
  replayAllAndStore,
  type OrderSnapshotRow,
  type SupplierRow,
} from "../db/queries.js"
import { replay } from "../replay/replay.js"
import { DEFAULT_REPLAY_CONFIG, type SupplierOffer } from "../replay/types.js"

export const refreshRouter = Router()

function toOffer(row: SupplierRow): SupplierOffer {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unit_price: row.unit_price ? Number.parseFloat(row.unit_price) : 0,
    delivery_days: row.delivery_days ?? 0,
    confidence: row.confidence ? Number.parseFloat(row.confidence) : 0,
  }
}

refreshRouter.post("/refresh", async (req: AuthedRequest, res: Response) => {
  if (!req.shop) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const shop = req.shop

  try {
    // 1. Sync Shopify orders
    let synced = 0

    try {
      const result = await syncOrdersForShop(shop)
      synced = result.synced ?? 0
    } catch (err) {
      console.error("[refresh] sync failed:", err)
      return res.status(502).json({
        error: "Failed to sync orders from Shopify",
      })
    }

    // 2. Replay + store decision logs
    const { ordersReplayed, totalMissedSavings } = await replayAllAndStore(
      shop.id,
      (order: OrderSnapshotRow, suppliers: SupplierRow[] = []) => {
        const safeSuppliers = Array.isArray(suppliers) ? suppliers : []

        const offers = safeSuppliers.map(toOffer)

        const result = replay(
          {
            id: order.id,
            currency: order.currency,
            line_items: order.line_items,
          },
          offers,
          DEFAULT_REPLAY_CONFIG,
        )

        return {
          missedSavings: result.missed_savings ?? 0,
          trace: result.trace,
          currency: result.currency,
          engineVersion: result.engine_version,
        }
      },
    )

    return res.json({
      ordersSynced: synced,
      ordersReplayed: ordersReplayed ?? 0,
      totalMissedSavings: totalMissedSavings ?? 0,
    })
  } catch (err) {
    console.error("[refresh] fatal error:", err)
    return res.status(500).json({
      error: "Internal server error",
    })
  }
})
