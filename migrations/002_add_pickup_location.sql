-- Adds pickup_location to an `orders` table created before pickup support was
-- added. Safe to run even if the column already exists.
-- Run this once against your database (Neon SQL editor, or
-- `psql "$DATABASE_URL" -f migrations/002_add_pickup_location.sql`).

-- Existing rows predate pickup selection, so they're backfilled to
-- 'pickering' — update them manually afterward if you'd rather review first.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_location TEXT NOT NULL DEFAULT 'pickering';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_pickup_location_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_pickup_location_check
      CHECK (pickup_location IN ('pickering', 'vaughan'));
  END IF;
END $$;