/*
  # Remove Current Snapshot if Duplicate Price

  ## Summary
  Removes the most recent cron snapshot if its price is essentially the same
  as the most recent swap snapshot (within 0.1% difference).

  ## Problem
  - We keep the most recent cron snapshot to show "current" price
  - But if no trades happened since last swap, price is the same
  - This creates a flat line from last trade to "current"
  - Makes charts look less clean

  ## Solution
  For each token, if the most recent non-swap snapshot has essentially the
  same price as the most recent swap snapshot (< 0.1% difference), delete it.

  ## Impact
  - Charts end at the last actual trade (no flat tail)
  - Only show current price if it differs from last trade
  - Cleaner, more accurate visualization
*/

-- Delete "current price" snapshots that are duplicates of the last trade
DELETE FROM price_snapshots ps
WHERE ps.id IN (
  SELECT latest.id
  FROM price_snapshots latest
  WHERE latest.id IN (
    -- Get most recent snapshot for each token
    SELECT DISTINCT ON (token_address) id
    FROM price_snapshots
    WHERE NOT is_interpolated
    ORDER BY token_address, created_at DESC
  )
  -- Only delete if this snapshot is NOT from a swap
  AND NOT EXISTS (
    SELECT 1 FROM swaps s
    WHERE s.token_address = latest.token_address
    AND s.block_number = latest.block_number
  )
  -- And if its price is within 0.1% of the most recent swap snapshot
  AND EXISTS (
    SELECT 1
    FROM price_snapshots last_swap
    JOIN swaps s ON s.token_address = last_swap.token_address 
                 AND s.block_number = last_swap.block_number
    WHERE last_swap.token_address = latest.token_address
    AND last_swap.created_at < latest.created_at
    AND ABS((latest.price_eth - last_swap.price_eth) / last_swap.price_eth) < 0.001
    ORDER BY last_swap.created_at DESC
    LIMIT 1
  )
);

-- Log results
DO $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM price_snapshots WHERE NOT is_interpolated;
  RAISE NOTICE 'Removed duplicate current-price snapshots. Remaining: %', remaining_count;
END $$;