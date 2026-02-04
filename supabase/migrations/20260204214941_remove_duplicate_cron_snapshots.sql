/*
  # Remove Duplicate Cron Snapshots

  ## Summary
  Removes price snapshots created by the cron job that duplicate the price
  from swap events. Only keeps snapshots that represent actual price changes
  from trades.

  ## Problem
  - Price-snapshot cron creates a new snapshot every minute
  - When no trades happen, these snapshots all have the same price
  - Creates flat lines on charts
  - Wastes database space

  ## Solution
  1. Delete cron-generated snapshots that are duplicates of swap snapshots
  2. Keep only the most recent cron snapshot to show current price
  3. For each token, keep: swap snapshots + latest cron snapshot if different

  ## Impact
  - Charts show only actual price changes from trades
  - No more flat lines from duplicate snapshots
  - Latest price still visible (from most recent cron snapshot)
*/

-- For each token, delete duplicate snapshots created by cron
-- Keep only: 1) snapshots at swap block numbers, 2) most recent snapshot
DELETE FROM price_snapshots ps
WHERE NOT is_interpolated
AND NOT EXISTS (
  -- Keep if there's a swap at this block
  SELECT 1 FROM swaps s
  WHERE s.token_address = ps.token_address
  AND s.block_number = ps.block_number
)
AND ps.id NOT IN (
  -- Keep the most recent snapshot for each token
  SELECT DISTINCT ON (token_address) id
  FROM price_snapshots
  WHERE NOT is_interpolated
  ORDER BY token_address, created_at DESC
);

-- Log results
DO $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM price_snapshots WHERE NOT is_interpolated;
  RAISE NOTICE 'Removed duplicate cron snapshots. Remaining non-interpolated snapshots: %', remaining_count;
END $$;