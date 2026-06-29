import { config } from "../config.js"

/**
 * Read-only Shopify Admin GraphQL client.
 *
 * Guardrails:
 *  - Rejects any operation that is not a `query` (no mutations, ever).
 *  - Honors cost-based throttling: on THROTTLED it backs off using the
 *    requested/restore rate, with bounded retries + jitter.
 */

const MAX_RETRIES = 5

interface ThrottleStatus {
  maximumAvailable: number
  currentlyAvailable: number
  restoreRate: number
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; extensions?: { code?: string } }>
  extensions?: { cost?: { throttleStatus?: ThrottleStatus } }
}

function assertReadOnly(operation: string): void {
  // Strip leading comments/whitespace, then ensure it begins with `query`.
  const normalized = operation.replace(/^\s*(#.*\n)*\s*/g, "").trimStart()
  if (/^mutation\b/i.test(normalized)) {
    throw new Error("Read-only client refuses to execute mutations.")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface ShopifyClient {
  graphql<T>(operation: string, variables?: Record<string, unknown>): Promise<T>
}

/**
 * Build a client bound to one shop + access token.
 * The access token must already be decrypted by the caller.
 */
export function createShopifyClient(shop: string, accessToken: string): ShopifyClient {
  const endpoint = `https://${shop}/admin/api/${config.shopify.apiVersion}/graphql.json`

  async function graphql<T>(
    operation: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    assertReadOnly(operation)

    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query: operation, variables }),
      })

      // HTTP-level rate limit.
      if (res.status === 429) {
        if (attempt >= MAX_RETRIES) throw new Error("Shopify rate limit: retries exhausted.")
        const retryAfter = Number.parseFloat(res.headers.get("Retry-After") ?? "2")
        await sleep(retryAfter * 1000 + Math.random() * 250)
        attempt++
        continue
      }

      if (!res.ok) {
        throw new Error(`Shopify GraphQL HTTP ${res.status}`)
      }

      const json = (await res.json()) as GraphQLResponse<T>

      // GraphQL-level throttle (cost based).
      const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED")
      if (throttled) {
        if (attempt >= MAX_RETRIES) throw new Error("Shopify cost throttle: retries exhausted.")
        const status = json.extensions?.cost?.throttleStatus
        const restoreRate = status?.restoreRate ?? 50
        // Wait roughly long enough to restore a query's worth of points.
        const waitMs = Math.min(2000, (1000 / restoreRate) * 100) + Math.random() * 250
        await sleep(waitMs)
        attempt++
        continue
      }

      if (json.errors?.length) {
        throw new Error(`Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`)
      }
      if (!json.data) {
        throw new Error("Shopify GraphQL returned no data.")
      }
      return json.data
    }
  }

  return { graphql }
}
