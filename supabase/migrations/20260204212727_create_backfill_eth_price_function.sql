/*
  # Create Function to Backfill ETH Prices

  ## Summary
  Creates a reusable function to correct eth_price_usd values in price_snapshots.
  This function can be called multiple times to process snapshots in batches.

  ## Problem
  - Historical price_snapshots have incorrect hardcoded eth_price_usd = 3300
  - Large update operations time out when processing all rows at once
  - Need a way to incrementally fix the data

  ## Solution
  Create a function that:
  1. Takes a batch size parameter
  2. Updates a limited number of snapshots per call
  3. Returns the number of rows updated
  4. Can be called repeatedly until all data is corrected

  ## Usage
  SELECT backfill_snapshot_eth_prices(1000); -- Update 1000 snapshots at a time
  Call this function multiple times until it returns 0 (no more rows to update)
*/

CREATE OR REPLACE FUNCTION backfill_snapshot_eth_prices(batch_size_param INT DEFAULT 1000)
RETURNS TABLE(rows_updated INT, eth_price_used NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  latest_eth_price NUMERIC;
  updated_count INT;
BEGIN
  -- Get the most recent ETH price from eth_price_history
  SELECT price_usd::numeric INTO latest_eth_price
  FROM eth_price_history
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Fallback if no price found
  IF latest_eth_price IS NULL THEN
    latest_eth_price := 2960.1;
  END IF;
  
  -- Update a batch of snapshots with the hardcoded 3300 price
  WITH to_update AS (
    SELECT id
    FROM price_snapshots
    WHERE eth_price_usd::numeric = 3300
    LIMIT batch_size_param
  )
  UPDATE price_snapshots ps
  SET eth_price_usd = latest_eth_price
  FROM to_update tu
  WHERE ps.id = tu.id;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN QUERY SELECT updated_count, latest_eth_price;
END;
$$;