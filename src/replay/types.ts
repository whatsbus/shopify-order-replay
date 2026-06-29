export interface LineItem {
  sku: string
  title: string
  qty: number
  actual_unit_cost: number
}

export interface SupplierOffer {
  id: number
  name: string
  sku: string
  unit_price: number
  delivery_days: number
  confidence: number
}

export interface ReplayOrder {
  id: number
  currency: string | null
  line_items: LineItem[]
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

export interface ReplayResult {
  order_id: number
  currency: string | null
  missed_savings: number
  trace: DecisionTraceLine[]
  engine_version: string
}

export interface ReplayConfig {
  minConfidence: number
  engineVersion: string
}

export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  minConfidence: 0.1,
  engineVersion: "mvp-1",
}
