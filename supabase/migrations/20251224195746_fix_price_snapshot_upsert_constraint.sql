/*
  # Fix Price Snapshot Upsert Constraint

  1. Problem
    - Current unique index has WHERE clause (partial index)
    - PostgreSQL doesn't support ON CONFLICT with partial indexes
    - Price snapshot function cannot upsert

  2. Solution
    - Drop partial unique index
    - Create full unique constraint without WHERE clause
    - All snapshots should have block_number anyway

  3. Impact
    - Enables proper upsert in price-snapshot function
    - Prevents duplicate snapshots at same block
*/

-- Drop the partial unique index
DROP INDEX IF EXISTS idx_price_snapshots_token_block;

-- Create a full unique constraint (no WHERE clause)
CREATE UNIQUE INDEX idx_price_snapshots_token_block
  ON price_snapshots(token_address, block_number);

-- Clean up any remaining duplicates (keep most recent)
WITH duplicates AS (
  SELECT 
    id,
    token_address,
    block_number,
    ROW_NUMBER() OVER (
      PARTITION BY token_address, block_number 
      ORDER BY created_at DESC
    ) as rn
  FROM price_snapshots
)
DELETE FROM price_snapshots
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
