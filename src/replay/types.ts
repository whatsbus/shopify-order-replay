/**
 * Shared types for the Replay Engine.
 * The engine is a pure data-in / data-out module: it imports nothing from
 * Shopify or the database. These types describe its inputs and outputs.
 */

/** A normalized line item captured from a Shopify order. */
export interface LineItem {
  sku: string
  title: string
  qty: number
  /** What the merchant actually paid per unit on this order. */
  actual_unit_cost: number
}

/** A merchant-entered supplier offer for a given SKU. */
export interface SupplierOffer {
  id: number
  name: string
  sku: string
  unit_price: number
  delivery_days: number
  /** 0..1 data-quality weight. Lower confidence down-ranks an offer. */
  confidence: number
}

/** The order shape the engine needs (subset of the DB row). */
export interface ReplayOrder {
  id: number
  currency: string | null
  line_items: LineItem[]
}

/** One scored candidate considered for a line item. */
export interface CandidateScore {
  supplier_id: number
  supplier_name: string
  unit_price: number
  delivery_days: number
  confidence: number
  /** Adjusted comparison cost (price scaled by confidence). */
  effective_unit_cost: number
  chosen: boolean
}

/** Per-line explainable reasoning produced by the engine. */
export interface DecisionTraceLine {
  sku: string
  title: string
  qty: number
  actual_unit_cost: number
  actual_line_cost: number
  /** null when no supplier offered this SKU. */
  best_supplier: string | null
  simulated_unit_cost: number | null
  simulated_line_cost: number | null
  line_savings: number
  candidates: CandidateScore[]
  reason: string
}

/** The full result of replaying a single order. */
export interface ReplayResult {
  order_id: number
  currency: string | null
  missed_savings: number
  trace: DecisionTraceLine[]
  engine_version: string
}

/** Tunable comparison weights. MVP defaults favor price, gated by confidence. */
export interface ReplayConfig {
  /** Minimum confidence for a supplier offer to be considered at all. */
  minConfidence: number
  engineVersion: string
}

export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  minConfidence: 0.1,
  engineVersion: "mvp-1",
}
