/*
  # Fix MCFUN Snapshots with Correct ETH Price

  ## Summary
  Updates all existing price snapshots to use the correct historical ETH price
  at the time of each trade.

  ## Problem
  - All existing snapshots use a fixed ETH price of $2,138.30
  - This makes USD prices inaccurate
  - MCFUN's Jan 27 trades used wrong ETH price (~$3,000 vs $2,138)

  ## Solution
  For each snapshot, find the nearest ETH price from eth_price_history
  and recalculate the USD price.

  ## Impact
  - All historical USD prices will be accurate
  - Charts will show correct USD values
  - No data loss, only correcting existing data
*/

-- Update all snapshots with correct ETH price from history
UPDATE price_snapshots ps
SET 
  eth_price_usd = (
    SELECT eph.price_usd
    FROM eth_price_history eph
    WHERE eph.timestamp <= ps.created_at
    ORDER BY eph.timestamp DESC
    LIMIT 1
  )
WHERE NOT is_interpolated;

-- Log results
DO $$
DECLARE
  updated_count INT;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM price_snapshots 
  WHERE NOT is_interpolated;
  
  RAISE NOTICE 'Updated % snapshots with correct ETH prices', updated_count;
END $$;