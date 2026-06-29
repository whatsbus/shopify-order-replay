import {
  DEFAULT_REPLAY_CONFIG,
  type CandidateScore,
  type DecisionTraceLine,
  type ReplayConfig,
  type ReplayOrder,
  type ReplayResult,
  type SupplierOffer,
} from "./types.js"

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function replayLine(
  line: ReplayOrder["line_items"][number],
  suppliers: SupplierOffer[],
  config: ReplayConfig,
): DecisionTraceLine {
  const qty = line.qty ?? 0
  const actualUnit = line.actual_unit_cost ?? 0
  const actualLineCost = round2(actualUnit * qty)

  const candidates = suppliers.filter(
    (s) =>
      s.sku === line.sku &&
      s.confidence >= config.minConfidence &&
      Number.isFinite(s.unit_price),
  )

  if (candidates.length === 0) {
    return {
      sku: line.sku,
      title: line.title,
      qty,
      actual_unit_cost: actualUnit,
      actual_line_cost: actualLineCost,
      best_supplier: null,
      simulated_unit_cost: null,
      simulated_line_cost: null,
      line_savings: 0,
      candidates: [],
      reason: `No alternative supplier for SKU ${line.sku}`,
    }
  }

  const scored = candidates
    .map((s) => {
      const unit = Number.isFinite(s.unit_price) ? s.unit_price : 0
      const confidence = Math.max(Number(s.confidence ?? 0), 0.01)

      return {
        supplier: s,
        effectiveUnitCost: unit / confidence,
      }
    })
    .sort((a, b) => {
      if (a.effectiveUnitCost !== b.effectiveUnitCost) {
        return a.effectiveUnitCost - b.effectiveUnitCost
      }
      return a.supplier.delivery_days - b.supplier.delivery_days
    })

  const winner = scored[0]?.supplier

  if (!winner) {
    return {
      sku: line.sku,
      title: line.title,
      qty,
      actual_unit_cost: actualUnit,
      actual_line_cost: actualLineCost,
      best_supplier: null,
      simulated_unit_cost: null,
      simulated_line_cost: null,
      line_savings: 0,
      candidates: [],
      reason: "No valid supplier candidates",
    }
  }

  const simulatedUnit = Number.isFinite(winner.unit_price) ? winner.unit_price : 0
  const simulatedLineCost = round2(simulatedUnit * qty)
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

  const perUnitDelta = round2(actualUnit - simulatedUnit)

  const reason =
    lineSavings > 0
      ? `${winner.name} cheaper by ${perUnitDelta}/unit`
      : `No cheaper alternative found`

  return {
    sku: line.sku,
    title: line.title,
    qty,
    actual_unit_cost: actualUnit,
    actual_line_cost: actualLineCost,
    best_supplier: winner.name,
    simulated_unit_cost: simulatedUnit,
    simulated_line_cost: simulatedLineCost,
    line_savings: lineSavings,
    candidates: candidateScores,
    reason,
  }
}

export function replay(
  order: ReplayOrder,
  suppliers: SupplierOffer[],
  config: ReplayConfig = DEFAULT_REPLAY_CONFIG,
): ReplayResult {
  const lines = order.line_items ?? []

  const trace = lines.map((line) =>
    replayLine(line, suppliers, config),
  )

  const missedSavings = round2(
    trace.reduce((sum, l) => sum + (l.line_savings || 0), 0),
  )

  return {
    order_id: order.id,
    currency: order.currency,
    missed_savings: missedSavings,
    trace,
    engine_version: config.engineVersion,
  }
}
