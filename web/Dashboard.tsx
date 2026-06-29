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

function formatMoney(amount: number, currency: string | null): string {
  const n = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency ?? ""}`.trim()
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
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
        setDecision(log ?? null)
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
        formatMoney(Number(order.totalActualCost), order.currency),
        order.hasDecision ? (
          <Text as="span" tone={order.missedSavings > 0 ? "critical" : "success"}>
            {formatMoney(Number(order.missedSavings), order.currency)}
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

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" tone="subdued">
                  Total missed savings
                </Text>
                <Text as="p" variant="heading2xl">
                  {formatMoney(Number(summary?.totalMissedSavings ?? 0), currency)}
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

        {suppliers.length === 0 && (
          <Layout.Section>
            <Banner tone="info" title="Add suppliers to start replaying">
              <p>Add supplier offers to enable comparison engine.</p>
              <Box paddingBlockStart="200">
                <Button onClick={() => setSupplierModalOpen(true)}>Add suppliers</Button>
              </Box>
            </Banner>
          </Layout.Section>
        )}

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
                  No orders synced yet.
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

        {expandedOrderId !== null && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Decision trace
                </Text>

                {decisionLoading && (
                  <Spinner accessibilityLabel="Loading trace" size="small" />
                )}

                {!decisionLoading && !decision && (
                  <Text as="p" tone="subdued">
                    No decision log.
                  </Text>
                )}

                {decision && (
                  <BlockStack gap="300">
                    <Text as="p">
                      Engine {decision.engineVersion} • Missed{" "}
                      <Text as="span" tone="critical" fontWeight="bold">
                        {formatMoney(Number(decision.missedSavings), decision.currency)}
                      </Text>
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
                              Paid {formatMoney(line.actual_unit_cost, decision.currency)}/unit •{" "}
                              Best {line.best_supplier} at{" "}
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
        currency={currency}
        onCreate={async (input) => {
          await api.createSupplier(input)
          setSuppliers(await api.getSuppliers())
        }}
        onDelete={async (id) => {
          await api.deleteSupplier(id)
          setSuppliers((p) => p.filter((s) => s.id !== id))
        }}
      />
    </Page>
  )
}

function SupplierModal({
  open,
  onClose,
  suppliers,
  currency,
  onCreate,
  onDelete,
}: any) {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [deliveryDays, setDeliveryDays] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supplierRows = suppliers.map((s: any) => [
    s.name,
    s.sku,
    `${Number(s.unitPrice).toFixed(2)} ${currency}`,
    `${s.deliveryDays} days`,
    <Button variant="plain" tone="critical" onClick={() => onDelete(s.id)}>
      Remove
    </Button>,
  ])

  const save = async () => {
    const price = Number(unitPrice)
    if (!name || !sku || !Number.isFinite(price)) {
      setError("Invalid input")
      return
    }

    setSaving(true)
    try {
      await onCreate({
        name,
        sku,
        unitPrice: price,
        deliveryDays: Number(deliveryDays || 0),
        confidence: 1,
      })
      setName("")
      setSku("")
      setUnitPrice("")
      setDeliveryDays("")
      setError(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Suppliers" size="large">
      <Modal.Section>
        <BlockStack gap="300">
          {error && <Banner tone="critical"><p>{error}</p></Banner>}

          <FormLayout>
            <TextField label="Name" value={name} onChange={setName} />
            <TextField label="SKU" value={sku} onChange={setSku} />
            <TextField label="Unit price" value={unitPrice} onChange={setUnitPrice} />
            <TextField label="Delivery days" value={deliveryDays} onChange={setDeliveryDays} />

            <Button loading={saving} onClick={save} variant="primary">
              Add
            </Button>
          </FormLayout>

          {suppliers.length > 0 && (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Supplier", "SKU", "Price", "Delivery", ""]}
              rows={supplierRows}
            />
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}
