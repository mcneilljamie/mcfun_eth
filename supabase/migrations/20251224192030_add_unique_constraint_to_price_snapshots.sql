/*
  # Add Unique Constraint to Price Snapshots

  ## Summary
  Prevents duplicate price snapshots from being created when the event indexer
  re-processes the same blocks. This is the root cause of chart oscillations.

  ## Changes
  1. Remove existing duplicates (keep most recent)
  2. Add unique constraint on (token_address, block_number, created_at)
  3. Create index to support the constraint

  ## Impact
  - Prevents duplicate snapshots from being inserted
  - Event indexer can safely use upsert operations
  - Eliminates root cause of chart oscillations
*/

-- First, identify and remove duplicate snapshots (keep the one with highest id)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token_address, block_number, created_at 
      ORDER BY id DESC
    ) as rn
  FROM price_snapshots
)
DELETE FROM price_snapshots
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_snapshots_unique_entry
  ON price_snapshots(token_address, block_number, created_at);

-- Note: The event indexer should now use upsert with onConflict
