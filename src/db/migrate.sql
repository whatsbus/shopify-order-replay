-- Decision Replay Engine schema (v2 - improved production version)

-- ---------------------------------------------------------------------------
-- shops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shops (
  id              BIGSERIAL PRIMARY KEY,
  shop_domain     TEXT NOT NULL UNIQUE,
  access_token    TEXT NOT NULL,
  scopes          TEXT NOT NULL,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- order_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  shop_id           BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  shopify_order_id  TEXT NOT NULL,
  order_name        TEXT,
  processed_at      TIMESTAMPTZ,
  currency          TEXT,
  total_actual_cost_cents BIGINT NOT NULL DEFAULT 0,
  line_items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_shop ON order_snapshots (shop_id);
CREATE INDEX IF NOT EXISTS idx_order_snapshots_shop_processed ON order_snapshots (shop_id, processed_at DESC);

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id              BIGSERIAL PRIMARY KEY,
  shop_id         BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  unit_price_cents BIGINT NOT NULL,
  delivery_days   INT NOT NULL DEFAULT 0,
  confidence      NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (shop_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_shop ON suppliers (shop_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_shop_sku ON suppliers (shop_id, sku);

-- ---------------------------------------------------------------------------
-- decision_logs (multi-run safe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_logs (
  id              BIGSERIAL PRIMARY KEY,
  run_id          UUID NOT NULL DEFAULT gen_random_uuid(),
  shop_id         BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id        BIGINT NOT NULL,
  missed_savings_cents BIGINT NOT NULL DEFAULT 0,
  currency        TEXT,
  trace           JSONB NOT NULL DEFAULT '[]'::jsonb,
  engine_version  TEXT NOT NULL DEFAULT 'mvp-1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (order_id, shop_id)
    REFERENCES order_snapshots (id, shop_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decision_logs_shop ON decision_logs (shop_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_order ON decision_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_run ON decision_logs (run_id);
