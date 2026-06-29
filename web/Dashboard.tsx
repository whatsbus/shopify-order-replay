import { useCallback, useEffect, useMemo, useState } from "react"
import { useAppBridge } from "@shopify/app-bridge-react"
import {
  Badge,
  Banner,
  Box,
  Button,
  Card,
  DataTable,
  FormLayout,
  InlineGrid,
  InlineStack,
  Layout,
  Modal,
  Page,
  Spinner,
  Text,
  TextField,
  BlockStack,
} from "@shopify/polaris"
import {
  createApiClient,
  type DecisionLog,
  type OrderRow,
  type OrderSummary,
  type Supplier,
} from "./api"

/**
 * The single dashboard screen.
 *
 *  - KPI header: total missed savings + counts + last synced + Refresh.
 *  - Supplier management modal (manual MVP input).
 *  - Orders table where each row expands to show the decision trace.
 */

function formatMoney(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim()
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function Dashboard() {
  const app = useAppBridge()
  const api = useMemo(() => createApiClient(app), [app])

  const [summary, setSummary] = useState<OrderSummary | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
  const [decision, setDecision] = useState<DecisionLog | null>(null)
  const [decisionLoading, setDecisionLoading] = useState(false)

  const [supplierModalOpen, setSupplierModalOpen] = useState(false)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [s, o, sup] = await Promise.all([
        api.getSummary(),
        api.getOrders(),
        api.getSuppliers(),
      ])
      setSummary(s)
      setOrders(o)
      setSuppliers(sup)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      await api.refresh()
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed")
    } finally {
      setRefreshing(false)
    }
  }, [api, loadAll])

  const handleExpand = useCallback(
    async (orderId: number) => {
      if (expandedOrderId === orderId) {
        setExpandedOrderId(null)
        setDecision(null)
        return
      }
      setExpandedOrderId(orderId)
      setDecision(null)
      setDecisionLoading(true)
      try {
        const log = await api.getDecision(orderId)
        setDecision(log)
      } catch {
        setDecision(null)
      } finally {
        setDecisionLoading(false)
      }
    },
    [api, expandedOrderId],
  )

  const currency = summary?.currency ?? "USD"

  const orderRows = useMemo(
    () =>
      orders.map((order) => [
        order.orderName ?? order.shopifyOrderId,
        formatDate(order.processedAt),
        formatMoney(order.totalActualCost, order.currency),
        order.hasDecision ? (
          <Text as="span" tone={order.missedSavings > 0 ? "critical" : "success"}>
            {formatMoney(order.missedSavings, order.currency)}
          </Text>
        ) : (
          <Badge tone="attention">Not analyzed</Badge>
        ),
        <Button
          variant="plain"
          onClick={() => handleExpand(order.id)}
          disclosure={expandedOrderId === order.id ? "up" : "down"}
        >
          {expandedOrderId === order.id ? "Hide" : "View trace"}
        </Button>,
      ]),
    [orders, expandedOrderId, handleExpand],
  )

  if (loading) {
    return (
      <Page title="Decision Replay Engine">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner accessibilityLabel="Loading" size="large" />
        </InlineStack>
      </Page>
    )
  }

  return (
    <Page
      title="Decision Replay Engine"
      subtitle="Read-only analysis of supplier savings you missed on past orders"
      primaryAction={{
        content: refreshing ? "Refreshing…" : "Refresh & replay",
        onAction: handleRefresh,
        loading: refreshing,
      }}
      secondaryActions={[
        { content: "Manage suppliers", onAction: () => setSupplierModalOpen(true) },
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Something went wrong" onDismiss={() => setError(null)}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* KPI header */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Total missed savings
                </Text>
                <Text as="p" variant="heading2xl">
                  {formatMoney(summary?.totalMissedSavings ?? 0, currency)}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Orders analyzed
                </Text>
                <Text as="p" variant="heading2xl">
                  {summary?.ordersAnalyzed ?? 0} / {summary?.totalOrders ?? 0}
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Last synced
                </Text>
                <Text as="p" variant="headingLg">
                  {summary?.lastSyncedAt
                    ? new Date(summary.lastSyncedAt).toLocaleString()
                    : "Never"}
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Empty states */}
        {suppliers.length === 0 && (
          <Layout.Section>
            <Banner tone="info" title="Add suppliers to start replaying">
              <p>
                The replay engine compares what you paid against alternative
                suppliers. Add at least one supplier offer, then run a refresh.
              </p>
              <Box paddingBlockStart="200">
                <Button onClick={() => setSupplierModalOpen(true)}>Add suppliers</Button>
              </Box>
            </Banner>
          </Layout.Section>
        )}

        {/* Orders table */}
        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <Text as="h2" variant="headingMd">
                Orders
              </Text>
            </Box>
            {orders.length === 0 ? (
              <Box padding="400">
                <Text as="p" tone="subdued">
                  No orders synced yet. Click “Refresh & replay” to pull your
                  latest orders from Shopify.
                </Text>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                headings={["Order", "Date", "Actual cost", "Missed savings", ""]}
                rows={orderRows}
              />
            )}
          </Card>
        </Layout.Section>

        {/* Expanded decision trace */}
        {expandedOrderId !== null && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Decision trace
                </Text>
                {decisionLoading && <Spinner accessibilityLabel="Loading trace" size="small" />}
                {!decisionLoading && !decision && (
                  <Text as="p" tone="subdued">
                    No decision log for this order yet. Run a refresh to generate one.
                  </Text>
                )}
                {decision && (
                  <BlockStack gap="300">
                    <Text as="p">
                      Engine {decision.engineVersion} • Missed{" "}
                      <Text as="span" fontWeight="bold" tone="critical">
                        {formatMoney(decision.missedSavings, decision.currency)}
                      </Text>{" "}
                      on this order.
                    </Text>
                    {decision.trace.map((line, idx) => (
                      <Box
                        key={`${line.sku}-${idx}`}
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <BlockStack gap="100">
                          <InlineStack align="space-between">
                            <Text as="span" fontWeight="semibold">
                              {line.title} ({line.sku}) × {line.qty}
                            </Text>
                            <Text
                              as="span"
                              tone={line.line_savings > 0 ? "critical" : "success"}
                              fontWeight="semibold"
                            >
                              {line.line_savings > 0
                                ? `${formatMoney(line.line_savings, decision.currency)} missed`
                                : "Best price"}
                            </Text>
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            {line.reason}
                          </Text>
                          {line.best_supplier && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Paid {formatMoney(line.actual_unit_cost, decision.currency)}/unit •
                              Best alternative {line.best_supplier} at{" "}
                              {formatMoney(line.simulated_unit_cost ?? 0, decision.currency)}/unit
                            </Text>
                          )}
                        </BlockStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>

      <SupplierModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        suppliers={suppliers}
        onCreate={async (input) => {
          await api.createSupplier(input)
          const updated = await api.getSuppliers()
          setSuppliers(updated)
        }}
        onDelete={async (id) => {
          await api.deleteSupplier(id)
          setSuppliers((prev) => prev.filter((s) => s.id !== id))
        }}
        currency={currency}
      />
    </Page>
  )
}

interface SupplierModalProps {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  currency: string
  onCreate: (input: Omit<Supplier, "id">) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function SupplierModal({
  open,
  onClose,
  suppliers,
  currency,
  onCreate,
  onDelete,
}: SupplierModalProps) {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [deliveryDays, setDeliveryDays] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const reset = () => {
    setName("")
    setSku("")
    setUnitPrice("")
    setDeliveryDays("")
    setFormError(null)
  }

  const handleSave = async () => {
    const price = Number.parseFloat(unitPrice)
    if (!name.trim() || !sku.trim() || !Number.isFinite(price)) {
      setFormError("Name, SKU, and a valid unit price are required.")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await onCreate({
        name: name.trim(),
        sku: sku.trim(),
        unitPrice: price,
        deliveryDays: Number.parseInt(deliveryDays || "0", 10),
        confidence: 1,
      })
      reset()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save supplier")
    } finally {
      setSaving(false)
    }
  }

  const supplierRows = suppliers.map((s) => [
    s.name,
    s.sku,
    formatMoney(s.unitPrice, currency),
    `${s.deliveryDays} days`,
    <Button variant="plain" tone="critical" onClick={() => onDelete(s.id)}>
      Remove
    </Button>,
  ])

  return (
    <Modal open={open} onClose={onClose} title="Manage suppliers" size="large">
      <Modal.Section>
        <BlockStack gap="400">
          {formError && (
            <Banner tone="critical">
              <p>{formError}</p>
            </Banner>
          )}
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="Supplier name"
                value={name}
                onChange={setName}
                autoComplete="off"
              />
              <TextField label="SKU" value={sku} onChange={setSku} autoComplete="off" />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField
                label="Unit price"
                type="number"
                value={unitPrice}
                onChange={setUnitPrice}
                prefix={currency}
                autoComplete="off"
              />
              <TextField
                label="Delivery days"
                type="number"
                value={deliveryDays}
                onChange={setDeliveryDays}
                autoComplete="off"
              />
            </FormLayout.Group>
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Add supplier
            </Button>
          </FormLayout>

          {suppliers.length > 0 && (
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text", "text"]}
              headings={["Supplier", "SKU", "Unit price", "Delivery", ""]}
              rows={supplierRows}
            />
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}
