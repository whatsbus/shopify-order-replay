import { createShopifyClient } from "../shopify/client.js"
import { decryptToken } from "../shopify/crypto.js"
import {
  getShopByDomain,
  touchShopSync,
  upsertOrderSnapshot,
  type ShopRow,
} from "../db/queries.js"
import type { LineItem } from "../replay/types.js"

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
    const unitCost = Number(edge.node.originalUnitPriceSet?.shopMoney.amount ?? 0)

    return {
      sku,
      title: edge.node.title,
      qty: edge.node.quantity ?? 0,
      actual_unit_cost: Number.isFinite(unitCost) ? unitCost : 0,
    }
  })
}

export async function syncOrders(
  shopId: number,
  shopDomain: string,
  accessToken: string,
): Promise<{ synced: number }> {
  const client = createShopifyClient(shopDomain, accessToken)

  let synced = 0
  let after: string | null = null
  let remaining = ORDERS_TO_FETCH

  try {
    while (remaining > 0) {
      const pageSize = Math.min(remaining, 50)

      const data: OrdersQueryResult = await client.graphql(ORDERS_QUERY, {
        first: pageSize,
        after,
      })

      const edges = data.orders?.edges ?? []

      if (edges.length === 0) break

      for (const { node } of edges) {
        const lineItems = normalizeLineItems(node.lineItems?.edges ?? [])
        const total = Number(node.totalPriceSet?.shopMoney.amount ?? 0)

        await upsertOrderSnapshot({
          shopId,
          shopifyOrderId: node.id,
          orderName: node.name ?? null,
          processedAt: node.processedAt ?? null,
          currency: node.currencyCode ?? null,
          totalActualCost: Number.isFinite(total) ? total : 0,
          lineItems,
          rawPayload: node,
        })

        synced++
      }

      after = data.orders.pageInfo.endCursor ?? null

      if (!data.orders.pageInfo.hasNextPage) break

      remaining -= edges.length
    }

    await touchShopSync(shopId)

    return { synced }
  } catch (err) {
    console.error("[sync] error:", err)
    throw err
  }
}

export async function runInitialSync(
  shopId: number,
  shopDomain: string,
  accessToken: string,
): Promise<void> {
  const result = await syncOrders(shopId, shopDomain, accessToken)
  console.log(`[sync] initial sync ${shopDomain}: ${result.synced}`)
}

export async function syncOrdersForShop(shop: ShopRow): Promise<{ synced: number }> {
  const token = decryptToken(shop.access_token)
  return syncOrders(shop.id, shop.shop_domain, token)
}

export async function getInstalledShop(shopDomain: string): Promise<ShopRow | null> {
  return getShopByDomain(shopDomain)
}
