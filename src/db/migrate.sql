-- Decision Replay Engine schema.
-- Idempotent: safe to run repeatedly. No write-path to Shopify; this is local state only.

-- ---------------------------------------------------------------------------
-- shops: one row per installed store. Holds the encrypted offline token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id            BIGSERIAL PRIMARY KEY,
  shop_domain   TEXT        NOT NULL UNIQUE,
  -- Access token is stored encrypted at rest (see src/shopify/crypto.ts).
  access_token  TEXT        NOT NULL,
  scopes        TEXT        NOT NULL,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- order_snapshots: immutable capture of a Shopify order at sync time.
-- line_items JSONB shape: [{ sku, title, qty, actual_unit_cost }]
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_snapshots (
  id                BIGSERIAL   PRIMARY KEY,
  shop_id           BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_order_id  TEXT        NOT NULL,
  order_name        TEXT,
  processed_at      TIMESTAMPTZ,
  currency          TEXT,
  total_actual_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_items        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_shop ON order_snapshots (shop_id);
CREATE INDEX IF NOT EXISTS idx_order_snapshots_processed ON order_snapshots (shop_id, processed_at DESC);

-- ---------------------------------------------------------------------------
-- suppliers: merchant-entered alternative supplier offers, keyed by SKU.
-- MVP keeps a single current offer per (shop, supplier, sku).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id            BIGSERIAL   PRIMARY KEY,
  shop_id       BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  sku           TEXT        NOT NULL,
  unit_price    NUMERIC(14, 2) NOT NULL,
  delivery_days INT         NOT NULL DEFAULT 0,
  confidence    NUMERIC(3, 2) NOT NULL DEFAULT 1.00, -- 0..1 data quality weight
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, name, sku)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_shop_sku ON suppliers (shop_id, sku);

-- ---------------------------------------------------------------------------
-- decision_logs: result of replaying one order. One row per order per run.
-- trace JSONB holds the full explainable reasoning per line item.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_logs (
  id             BIGSERIAL   PRIMARY KEY,
  shop_id        BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id       BIGINT      NOT NULL REFERENCES order_snapshots(id) ON DELETE CASCADE,
  missed_savings NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency       TEXT,
  trace          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  engine_version TEXT        NOT NULL DEFAULT 'mvp-1',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_logs_shop ON decision_logs (shop_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_order ON decision_logs (order_id);
