import { createShopifyClient } from "../shopify/client.js"
import { decryptToken } from "../shopify/crypto.js"
import {
  getShopByDomain,
  touchShopSync,
  upsertOrderSnapshot,
  type ShopRow,
} from "../db/queries.js"
import type { LineItem } from "../replay/types.js"

/**
 * Order Sync Service: read-only ingestion of the last ~50 orders.
 *
 * Captures each order as an immutable snapshot (idempotent upsert). Uses the
 * Admin GraphQL API with cursor pagination. No write operations.
 */

const ORDERS_TO_FETCH = 50

const ORDERS_QUERY = /* GraphQL */ `
  query RecentOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: PROCESSED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          processedAt
          currencyCode
          totalPriceSet { shopMoney { amount } }
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                sku
                originalUnitPriceSet { shopMoney { amount } }
                variant { sku }
              }
            }
          }
        }
      }
    }
  }
`

interface OrdersQueryResult {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
    edges: Array<{
      node: {
        id: string
        name: string
        processedAt: string | null
        currencyCode: string | null
        totalPriceSet: { shopMoney: { amount: string } } | null
        lineItems: {
          edges: Array<{
            node: {
              title: string
              quantity: number
              sku: string | null
              originalUnitPriceSet: { shopMoney: { amount: string } } | null
              variant: { sku: string | null } | null
            }
          }>
        }
      }
    }>
  }
}

function normalizeLineItems(
  edges: OrdersQueryResult["orders"]["edges"][number]["node"]["lineItems"]["edges"],
): LineItem[] {
  return edges.map((edge) => {
    const sku = edge.node.sku ?? edge.node.variant?.sku ?? "UNKNOWN"
    const unitCost = Number.parseFloat(
      edge.node.originalUnitPriceSet?.shopMoney.amount ?? "0",
    )
    return {
      sku,
      title: edge.node.title,
      qty: edge.node.quantity,
      actual_unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
    }
  })
}

/**
 * Core sync routine. Accepts a decrypted access token directly so it can be
 * called from the OAuth callback (which already has the plaintext token).
 */
export async function syncOrders(
  shopId: number,
  shopDomain: string,
  accessToken: string,
): Promise<{ synced: number }> {
  const client = createShopifyClient(shopDomain, accessToken)

  let synced = 0
  let after: string | null = null
  let remaining = ORDERS_TO_FETCH

  while (remaining > 0) {
    const pageSize = Math.min(remaining, 50)
    const data: OrdersQueryResult = await client.graphql<OrdersQueryResult>(ORDERS_QUERY, {
      first: pageSize,
      after,
    })

    for (const edge of data.orders.edges) {
      const node = edge.node
      const lineItems = normalizeLineItems(node.lineItems.edges)
      const total = Number.parseFloat(node.totalPriceSet?.shopMoney.amount ?? "0")

      await upsertOrderSnapshot({
        shopId,
        shopifyOrderId: node.id,
        orderName: node.name,
        processedAt: node.processedAt,
        currency: node.currencyCode,
        totalActualCost: Number.isFinite(total) ? total : 0,
        lineItems,
        rawPayload: node,
      })
      synced++
    }

    remaining -= data.orders.edges.length
    if (!data.orders.pageInfo.hasNextPage || data.orders.edges.length === 0) break
    after = data.orders.pageInfo.endCursor
  }

  await touchShopSync(shopId)
  return { synced }
}

/** Fire-and-forget initial sync triggered from the OAuth callback. */
export async function runInitialSync(
  shopId: number,
  shopDomain: string,
  accessToken: string,
): Promise<void> {
  const result = await syncOrders(shopId, shopDomain, accessToken)
  console.log(`[v0] Initial sync for ${shopDomain}: ${result.synced} orders.`)
}

/** Sync using a stored shop row (decrypts the token). Used by /refresh. */
export async function syncOrdersForShop(shop: ShopRow): Promise<{ synced: number }> {
  const token = decryptToken(shop.access_token)
  return syncOrders(shop.id, shop.shop_domain, token)
}

/** Convenience lookup used by routes that only have a domain. */
export async function getInstalledShop(shopDomain: string): Promise<ShopRow | null> {
  return getShopByDomain(shopDomain)
}
