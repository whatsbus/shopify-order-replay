import { config } from "../config.js"

/**
 * Read-only Shopify Admin GraphQL client.
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
  const normalized = operation.replace(/^\s*(#.*\n)*\s*/g, "").trimStart()

  if (/^mutation\b/i.test(normalized)) {
    throw new Error("Read-only client refuses mutations")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface ShopifyClient {
  graphql<T>(operation: string, variables?: Record<string, unknown>): Promise<T>
}

export function createShopifyClient(
  shop: string,
  accessToken: string,
): ShopifyClient {
  const endpoint = `https://${shop}/admin/api/${config.shopify.apiVersion}/graphql.json`

  async function graphql<T>(
    operation: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    assertReadOnly(operation)

    let attempt = 0

    while (true) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query: operation, variables }),
        })

        if (res.status === 429) {
          if (attempt++ >= MAX_RETRIES) {
            throw new Error("Shopify rate limit exceeded")
          }

          const retryAfter = Number(res.headers.get("Retry-After") ?? 2)
          await sleep(retryAfter * 1000)
          continue
        }

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`)
        }

        const json = (await res.json()) as GraphQLResponse<T>

        if (json.errors?.length) {
          const isThrottle = json.errors.some(
            (e) => e.extensions?.code === "THROTTLED",
          )

          if (isThrottle) {
            if (attempt++ >= MAX_RETRIES) {
              throw new Error("Shopify throttle exhausted")
            }

            const restoreRate =
              json.extensions?.cost?.throttleStatus?.restoreRate ?? 50

            const wait = Math.min(2000, (1000 / restoreRate) * 120)

            await sleep(wait)
            continue
          }

          throw new Error(json.errors.map((e) => e.message).join("; "))
        }

        if (!json.data) {
          throw new Error("No data returned from Shopify")
        }

        return json.data
      } catch (err) {
        if (attempt++ >= MAX_RETRIES) {
          throw err
        }

        await sleep(300 + Math.random() * 300)
      }
    }
  }

  return { graphql }
}
