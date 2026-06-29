import {
  DEFAULT_REPLAY_CONFIG,
  type CandidateScore,
  type DecisionTraceLine,
  type ReplayConfig,
  type ReplayOrder,
  type ReplayResult,
  type SupplierOffer,
} from "./types.js"

/**
 * Replay Engine (counterfactual decision system).
 *
 * Pure function: given one order and the set of supplier offers, it computes
 * what the cheapest viable supplier would have been for each line item and how
 * much the merchant "missed" by paying what they actually paid.
 *
 * Design notes:
 *  - Selection is lowest effective cost (price adjusted by confidence),
 *    tie-broken by faster delivery. This is intentionally simple and fully
 *    explainable for the MVP.
 *  - Savings are clamped at >= 0: you cannot "miss" a deal that was worse.
 *  - Imports nothing from Shopify or the DB. Deterministic and reproducible.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function replayLine(
  line: ReplayOrder["line_items"][number],
  suppliers: SupplierOffer[],
  config: ReplayConfig,
): DecisionTraceLine {
  const actualLineCost = round2(line.actual_unit_cost * line.qty)

  // Only suppliers offering THIS sku, above the confidence floor.
  const candidates = suppliers.filter(
    (s) => s.sku === line.sku && s.confidence >= config.minConfidence,
  )

  if (candidates.length === 0) {
    return {
      sku: line.sku,
      title: line.title,
      qty: line.qty,
      actual_unit_cost: line.actual_unit_cost,
      actual_line_cost: actualLineCost,
      best_supplier: null,
      simulated_unit_cost: null,
      simulated_line_cost: null,
      line_savings: 0,
      candidates: [],
      reason: `No alternative supplier on file for SKU "${line.sku}". Nothing to compare.`,
    }
  }

  // Effective cost = price divided by confidence so uncertain offers rank lower.
  const scored = candidates
    .map((s) => ({
      supplier: s,
      effectiveUnitCost: s.unit_price / Math.max(s.confidence, 0.01),
    }))
    .sort((a, b) => {
      if (a.effectiveUnitCost !== b.effectiveUnitCost) {
        return a.effectiveUnitCost - b.effectiveUnitCost
      }
      return a.supplier.delivery_days - b.supplier.delivery_days
    })

  const winner = scored[0].supplier
  const simulatedUnitCost = winner.unit_price
  const simulatedLineCost = round2(simulatedUnitCost * line.qty)
  const lineSavings = Math.max(0, round2(actualLineCost - simulatedLineCost))

  const candidateScores: CandidateScore[] = scored.map((c) => ({
    supplier_id: c.supplier.id,
    supplier_name: c.supplier.name,
    unit_price: c.supplier.unit_price,
    delivery_days: c.supplier.delivery_days,
    confidence: c.supplier.confidence,
    effective_unit_cost: round2(c.effectiveUnitCost),
    chosen: c.supplier.id === winner.id,
  }))

  const perUnitDelta = round2(line.actual_unit_cost - simulatedUnitCost)
  const reason =
    lineSavings > 0
      ? `${winner.name} offered ${line.sku} at ${simulatedUnitCost} vs ${line.actual_unit_cost} paid ` +
        `(${perUnitDelta} cheaper per unit x ${line.qty} = ${lineSavings} saved).`
      : `Paid amount (${line.actual_unit_cost}/unit) was already at or below the best ` +
        `alternative (${winner.name} at ${simulatedUnitCost}). No missed savings.`

  return {
    sku: line.sku,
    title: line.title,
    qty: line.qty,
    actual_unit_cost: line.actual_unit_cost,
    actual_line_cost: actualLineCost,
    best_supplier: winner.name,
    simulated_unit_cost: simulatedUnitCost,
    simulated_line_cost: simulatedLineCost,
    line_savings: lineSavings,
    candidates: candidateScores,
    reason,
  }
}

/**
 * Replay a single order against the supplier set.
 */
export function replay(
  order: ReplayOrder,
  suppliers: SupplierOffer[],
  config: ReplayConfig = DEFAULT_REPLAY_CONFIG,
): ReplayResult {
  const trace = (order.line_items ?? []).map((line) =>
    replayLine(line, suppliers, config),
  )
  const missedSavings = round2(
    trace.reduce((sum, line) => sum + line.line_savings, 0),
  )

  return {
    order_id: order.id,
    currency: order.currency,
    missed_savings: missedSavings,
    trace,
    engine_version: config.engineVersion,
  }
}
