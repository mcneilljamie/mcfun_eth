/*
  # Fix Price Snapshot Unique Constraint
  
  ## Summary
  The current unique constraint includes `created_at`, which allows duplicate
  snapshots at the same block because the timestamp differs. This creates
  oscillations when the cron runs multiple times within the same block period.
  
  ## Changes
  1. Drop old constraint that includes created_at
  2. Create new constraint on only (token_address, block_number)
  3. This prevents multiple snapshots at the same block
  
  ## Impact
  - Truly prevents duplicate snapshots at same block
  - Price-snapshot cron can safely upsert
  - Eliminates remaining chart oscillations
*/

-- Drop the old index with created_at
DROP INDEX IF EXISTS idx_price_snapshots_unique_entry;

-- Create a proper unique constraint without created_at
-- This prevents multiple snapshots at the same block for the same token
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_snapshots_token_block
  ON price_snapshots(token_address, block_number)
  WHERE block_number IS NOT NULL;

-- Clean up any remaining duplicates (keep most recent created_at)
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
  WHERE block_number IS NOT NULL
)
DELETE FROM price_snapshots
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
