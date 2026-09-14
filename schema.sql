-- Sweet Batch Cookie Co. — order database schema
-- Run this once against your Postgres database (e.g. a Neon free-tier
-- database) before deploying. See README.md for setup instructions.

CREATE TABLE IF NOT EXISTS orders (
  id                          UUID PRIMARY KEY,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Customer details
  customer_name               TEXT NOT NULL,
  customer_email              TEXT NOT NULL,
  customer_phone              TEXT,
  customer_notes              TEXT,

  -- Order contents. `items` is a JSON array of
  -- { packId, packName, count, priceCents, flavours: { flavourId: qty } }
  -- so a single submission can hold multiple separate pack orders.
  items                       JSONB NOT NULL,
  total_cookies               INTEGER NOT NULL,

  -- Money, all in cents. subtotal + tax = total (total is what's actually
  -- charged/requested). Tax is stored at order time rather than recomputed
  -- later, so a future change to the tax rate never rewrites past orders.
  subtotal_cents               INTEGER NOT NULL DEFAULT 0,
  tax_cents                    INTEGER NOT NULL DEFAULT 0,
  total_cents                 INTEGER NOT NULL,

  -- Which Monday-start (America/Toronto) week this order counts against,
  -- stored as a plain date for simple, indexable cap queries.
  week_start                  DATE NOT NULL,

  -- Payment
  payment_method               TEXT NOT NULL CHECK (payment_method IN ('stripe', 'etransfer')),
  status                       TEXT NOT NULL CHECK (
                                  status IN (
                                    'pending_stripe',
                                    'pending_etransfer',
                                    'paid',
                                    'cancelled',
                                    'expired'
                                  )
                                ),
  stripe_session_id            TEXT UNIQUE,
  stripe_payment_intent_id     TEXT,

  -- Confirmation email
  confirmation_email_sent_at   TIMESTAMPTZ,

  -- Manual e-Transfer confirmation trail
  admin_confirmed_by           TEXT,
  admin_confirmed_at           TIMESTAMPTZ,
  admin_cancelled_by           TEXT,
  admin_cancelled_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_week_status ON orders (week_start, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders (stripe_session_id);
