import type { ClientApplication } from "@shopify/app-bridge"
import { getSessionToken } from "@shopify/app-bridge/utilities"

/**
 * Thin fetch wrapper for the embedded frontend.
 *
 * Every backend call attaches a fresh App Bridge session token in the
 * Authorization header. The backend verifies it and scopes the request to
 * the calling shop. No access token ever touches the browser.
 */

export interface OrderSummary {
  totalMissedSavings: number
  ordersAnalyzed: number
  totalOrders: number
  currency: string | null
  lastSyncedAt: string | null
}

export interface OrderRow {
  id: number
  shopifyOrderId: string
  orderName: string | null
  processedAt: string | null
  currency: string | null
  totalActualCost: number
  missedSavings: number
  hasDecision: boolean
}

export interface CandidateScore {
  supplier_id: number
  supplier_name: string
  unit_price: number
  delivery_days: number
  confidence: number
  effective_unit_cost: number
  chosen: boolean
}

export interface DecisionTraceLine {
  sku: string
  title: string
  qty: number
  actual_unit_cost: number
  actual_line_cost: number
  best_supplier: string | null
  simulated_unit_cost: number | null
  simulated_line_cost: number | null
  line_savings: number
  candidates: CandidateScore[]
  reason: string
}

export interface DecisionLog {
  orderId: number
  missedSavings: number
  currency: string | null
  engineVersion: string
  createdAt: string
  trace: DecisionTraceLine[]
}

export interface Supplier {
  id: number
  name: string
  sku: string
  unitPrice: number
  deliveryDays: number
  confidence: number
}

export interface RefreshResult {
  ordersSynced: number
  ordersReplayed: number
  totalMissedSavings: number
}

/** Build an API client bound to an App Bridge app instance. */
export function createApiClient(app: ClientApplication) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getSessionToken(app)

    const res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    })

    if (res.status === 204) return undefined as T

    if (!res.ok) {
      let message = `Request failed: ${res.status}`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {}
      throw new Error(message)
    }

    return (await res.json()) as T
  }

  return {
    getSummary: () => request<OrderSummary>("/summary"),
    getOrders: () => request<OrderRow[]>("/orders"),
    getDecision: (orderId: number) => request<DecisionLog>(`/decision/${orderId}`),

    getSuppliers: () => request<Supplier[]>("/suppliers"),
    createSupplier: (input: Omit<Supplier, "id">) =>
      request<Supplier>("/suppliers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    deleteSupplier: (id: number) =>
      request<void>(`/suppliers/${id}`, { method: "DELETE" }),

    refresh: () =>
      request<RefreshResult>("/refresh", {
        method: "POST",
      }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
