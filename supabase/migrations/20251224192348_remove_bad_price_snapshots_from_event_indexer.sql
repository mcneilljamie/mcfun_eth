/*
  # Remove Bad Price Snapshots from Event Indexer
  
  ## Summary
  Removes duplicate price snapshots created by the event indexer that have
  incorrect reserves. These snapshots are created when the event indexer reads
  current reserves instead of historical reserves at the specific block.
  
  ## Changes
  1. Identify and delete snapshots with duplicate block numbers
  2. Keep only the correct snapshot (second one created) at each block
  3. The incorrect snapshots all share the same wrong reserves
  
  ## Impact
  - Removes oscillating price data from charts
  - Charts will now show smooth, accurate price movements
  - Future fix needed in event indexer to prevent re-creation
*/

-- Delete duplicate snapshots at the same block (keep only the latest)
WITH duplicates AS (
  SELECT 
    id,
    token_address,
    block_number,
    created_at,
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

-- Note: This removes the earlier snapshot at each block
-- The event indexer creates incorrect snapshots first, then cron creates correct ones
