-- Adds subtotal/tax tracking to an `orders` table created before tax support
-- was added. Safe to run even if the columns already exist.
-- Run this once against your database (Neon SQL editor, or `psql "$DATABASE_URL" -f migrations/001_add_tax_columns.sql`).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows: treat their current total_cents as the pre-tax
-- subtotal (since they were created before tax existed) and leave tax at 0.
-- If you have real pre-tax orders you'd rather leave untouched, skip this
-- UPDATE — new orders will populate both columns correctly regardless.
UPDATE orders SET subtotal_cents = total_cents WHERE subtotal_cents = 0 AND tax_cents = 0;
