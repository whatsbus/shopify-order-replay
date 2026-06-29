import { query, withTransaction } from "./pool.js"
import type { LineItem, DecisionTraceLine } from "../replay/types.js"

/**
 * Data-access layer. Every function that touches tenant data takes a shopId
 * (or shopDomain) and scopes its query by it. There is no cross-shop access.
 */

// ----------------------------- shops ---------------------------------------

export interface ShopRow {
  id: number
  shop_domain: string
  access_token: string
  scopes: string
  installed_at: string
  updated_at: string
  last_synced_at: string | null
}

/** Insert or update a shop's encrypted token + scopes on (re)install. */
export async function upsertShop(params: {
  shopDomain: string
  encryptedToken: string
  scopes: string
}): Promise<ShopRow> {
  const { rows } = await query<ShopRow>(
    `INSERT INTO shops (shop_domain, access_token, scopes)
     VALUES ($1, $2, $3)
     ON CONFLICT (shop_domain)
     DO UPDATE SET access_token = EXCLUDED.access_token,
                   scopes = EXCLUDED.scopes,
                   updated_at = now()
     RETURNING *`,
    [params.shopDomain, params.encryptedToken, params.scopes],
  )
  return rows[0]
}

export async function getShopByDomain(shopDomain: string): Promise<ShopRow | null> {
  const { rows } = await query<ShopRow>(
    `SELECT * FROM shops WHERE shop_domain = $1`,
    [shopDomain],
  )
  return rows[0] ?? null
}

export async function touchShopSync(shopId: number): Promise<void> {
  await query(`UPDATE shops SET last_synced_at = now() WHERE id = $1`, [shopId])
}

/** Full GDPR purge: cascades remove all order/supplier/decision rows. */
export async function deleteShop(shopDomain: string): Promise<void> {
  await query(`DELETE FROM shops WHERE shop_domain = $1`, [shopDomain])
}

// -------------------------- order snapshots --------------------------------

export interface OrderSnapshotRow {
  id: number
  shop_id: number
  shopify_order_id: string
  order_name: string | null
  processed_at: string | null
  currency: string | null
  total_actual_cost: string
  line_items: LineItem[]
  created_at: string
}

/** Idempotent upsert of an order snapshot keyed by (shop, shopify_order_id). */
export async function upsertOrderSnapshot(params: {
  shopId: number
  shopifyOrderId: string
  orderName: string | null
  processedAt: string | null
  currency: string | null
  totalActualCost: number
  lineItems: LineItem[]
  rawPayload: unknown
}): Promise<OrderSnapshotRow> {
  const { rows } = await query<OrderSnapshotRow>(
    `INSERT INTO order_snapshots
       (shop_id, shopify_order_id, order_name, processed_at, currency,
        total_actual_cost, line_items, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (shop_id, shopify_order_id)
     DO UPDATE SET order_name = EXCLUDED.order_name,
                   processed_at = EXCLUDED.processed_at,
                   currency = EXCLUDED.currency,
                   total_actual_cost = EXCLUDED.total_actual_cost,
                   line_items = EXCLUDED.line_items,
                   raw_payload = EXCLUDED.raw_payload
     RETURNING *`,
    [
      params.shopId,
      params.shopifyOrderId,
      params.orderName,
      params.processedAt,
      params.currency,
      params.totalActualCost,
      JSON.stringify(params.lineItems),
      JSON.stringify(params.rawPayload ?? null),
    ],
  )
  return rows[0]
}

export async function listOrderSnapshots(shopId: number): Promise<OrderSnapshotRow[]> {
  const { rows } = await query<OrderSnapshotRow>(
    `SELECT id, shop_id, shopify_order_id, order_name, processed_at, currency,
            total_actual_cost, line_items, created_at
     FROM order_snapshots
     WHERE shop_id = $1
     ORDER BY processed_at DESC NULLS LAST
     LIMIT 200`,
    [shopId],
  )
  return rows
}

export async function getOrderSnapshot(
  shopId: number,
  orderId: number,
): Promise<OrderSnapshotRow | null> {
  const { rows } = await query<OrderSnapshotRow>(
    `SELECT id, shop_id, shopify_order_id, order_name, processed_at, currency,
            total_actual_cost, line_items, created_at
     FROM order_snapshots
     WHERE shop_id = $1 AND id = $2`,
    [shopId, orderId],
  )
  return rows[0] ?? null
}

// ----------------------------- suppliers -----------------------------------

export interface SupplierRow {
  id: number
  shop_id: number
  name: string
  sku: string
  unit_price: string
  delivery_days: number
  confidence: string
  created_at: string
  updated_at: string
}

export async function listSuppliers(shopId: number): Promise<SupplierRow[]> {
  const { rows } = await query<SupplierRow>(
    `SELECT * FROM suppliers WHERE shop_id = $1 ORDER BY name, sku`,
    [shopId],
  )
  return rows
}

export async function upsertSupplier(params: {
  shopId: number
  name: string
  sku: string
  unitPrice: number
  deliveryDays: number
  confidence: number
}): Promise<SupplierRow> {
  const { rows } = await query<SupplierRow>(
    `INSERT INTO suppliers (shop_id, name, sku, unit_price, delivery_days, confidence)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (shop_id, name, sku)
     DO UPDATE SET unit_price = EXCLUDED.unit_price,
                   delivery_days = EXCLUDED.delivery_days,
                   confidence = EXCLUDED.confidence,
                   updated_at = now()
     RETURNING *`,
    [
      params.shopId,
      params.name,
      params.sku,
      params.unitPrice,
      params.deliveryDays,
      params.confidence,
    ],
  )
  return rows[0]
}

export async function updateSupplier(
  shopId: number,
  supplierId: number,
  fields: { name: string; sku: string; unitPrice: number; deliveryDays: number; confidence: number },
): Promise<SupplierRow | null> {
  const { rows } = await query<SupplierRow>(
    `UPDATE suppliers
     SET name = $3, sku = $4, unit_price = $5, delivery_days = $6,
         confidence = $7, updated_at = now()
     WHERE shop_id = $1 AND id = $2
     RETURNING *`,
    [shopId, supplierId, fields.name, fields.sku, fields.unitPrice, fields.deliveryDays, fields.confidence],
  )
  return rows[0] ?? null
}

export async function deleteSupplier(shopId: number, supplierId: number): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM suppliers WHERE shop_id = $1 AND id = $2`,
    [shopId, supplierId],
  )
  return (rowCount ?? 0) > 0
}

// --------------------------- decision logs ---------------------------------

export interface DecisionLogRow {
  id: number
  shop_id: number
  order_id: number
  missed_savings: string
  currency: string | null
  trace: DecisionTraceLine[]
  engine_version: string
  created_at: string
}

/** Upsert a decision log per (shop, order). Re-running a replay overwrites it. */
export async function upsertDecisionLog(params: {
  shopId: number
  orderId: number
  missedSavings: number
  currency: string | null
  trace: DecisionTraceLine[]
  engineVersion: string
}): Promise<DecisionLogRow> {
  const { rows } = await query<DecisionLogRow>(
    `INSERT INTO decision_logs
       (shop_id, order_id, missed_savings, currency, trace, engine_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (shop_id, order_id)
     DO UPDATE SET missed_savings = EXCLUDED.missed_savings,
                   currency = EXCLUDED.currency,
                   trace = EXCLUDED.trace,
                   engine_version = EXCLUDED.engine_version,
                   created_at = now()
     RETURNING *`,
    [
      params.shopId,
      params.orderId,
      params.missedSavings,
      params.currency,
      JSON.stringify(params.trace),
      params.engineVersion,
    ],
  )
  return rows[0]
}

export async function getDecisionLogByOrder(
  shopId: number,
  orderId: number,
): Promise<DecisionLogRow | null> {
  const { rows } = await query<DecisionLogRow>(
    `SELECT * FROM decision_logs WHERE shop_id = $1 AND order_id = $2`,
    [shopId, orderId],
  )
  return rows[0] ?? null
}

/** Order list joined with its missed-savings figure, for the dashboard table. */
export interface OrderWithSavingsRow {
  id: number
  shopify_order_id: string
  order_name: string | null
  processed_at: string | null
  currency: string | null
  total_actual_cost: string
  missed_savings: string | null
  has_decision: boolean
}

export async function listOrdersWithSavings(shopId: number): Promise<OrderWithSavingsRow[]> {
  const { rows } = await query<OrderWithSavingsRow>(
    `SELECT o.id, o.shopify_order_id, o.order_name, o.processed_at,
            o.currency, o.total_actual_cost,
            d.missed_savings,
            (d.id IS NOT NULL) AS has_decision
     FROM order_snapshots o
     LEFT JOIN decision_logs d ON d.order_id = o.id AND d.shop_id = o.shop_id
     WHERE o.shop_id = $1
     ORDER BY o.processed_at DESC NULLS LAST
     LIMIT 200`,
    [shopId],
  )
  return rows
}

/** Aggregate KPIs for the dashboard header. */
export interface SummaryRow {
  total_missed_savings: string
  orders_analyzed: string
  total_orders: string
  currency: string | null
}

export async function getSummary(shopId: number): Promise<SummaryRow> {
  const { rows } = await query<SummaryRow>(
    `SELECT
        COALESCE(SUM(d.missed_savings), 0) AS total_missed_savings,
        COUNT(d.id)                        AS orders_analyzed,
        (SELECT COUNT(*) FROM order_snapshots WHERE shop_id = $1) AS total_orders,
        (SELECT currency FROM order_snapshots WHERE shop_id = $1
          AND currency IS NOT NULL LIMIT 1) AS currency
     FROM decision_logs d
     WHERE d.shop_id = $1`,
    [shopId],
  )
  return rows[0]
}

/** Replay all orders for a shop inside one transaction (used by /refresh). */
export async function replayAllAndStore(
  shopId: number,
  replayFn: (order: OrderSnapshotRow, suppliers: SupplierRow[]) => {
    missedSavings: number
    trace: DecisionTraceLine[]
    currency: string | null
    engineVersion: string
  },
): Promise<{ ordersReplayed: number; totalMissedSavings: number }> {
  return withTransaction(async (client) => {
    const { rows: orders } = await client.query<OrderSnapshotRow>(
      `SELECT id, shop_id, shopify_order_id, order_name, processed_at, currency,
              total_actual_cost, line_items, created_at
       FROM order_snapshots WHERE shop_id = $1`,
      [shopId],
    )
    const { rows: suppliers } = await client.query<SupplierRow>(
      `SELECT * FROM suppliers WHERE shop_id = $1`,
      [shopId],
    )

    let totalMissedSavings = 0
    for (const order of orders) {
      const result = replayFn(order, suppliers)
      totalMissedSavings += result.missedSavings
      await client.query(
        `INSERT INTO decision_logs
           (shop_id, order_id, missed_savings, currency, trace, engine_version)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (shop_id, order_id)
         DO UPDATE SET missed_savings = EXCLUDED.missed_savings,
                       currency = EXCLUDED.currency,
                       trace = EXCLUDED.trace,
                       engine_version = EXCLUDED.engine_version,
                       created_at = now()`,
        [
          shopId,
          order.id,
          result.missedSavings,
          result.currency,
          JSON.stringify(result.trace),
          result.engineVersion,
        ],
      )
    }
    return { ordersReplayed: orders.length, totalMissedSavings }
  })
}
