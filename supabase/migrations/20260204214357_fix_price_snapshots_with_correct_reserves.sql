/*
  # Fix Price Snapshots with Correct Reserves

  ## Summary
  Updates existing price snapshots to use correct token reserve calculations
  that account for liquidity_percent.

  ## Problem
  - Snapshots calculated with 1,000,000 tokens in pool at launch
  - Should be 1,000,000 * (liquidity_percent / 100)
  - Causes wrong prices and market caps on charts

  ## Solution
  Update all snapshots to recalculate reserves correctly.

  ## Impact
  - Accurate historical price data
  - Charts show correct market caps from launch
*/

-- Update existing snapshots with correct calculations
UPDATE price_snapshots ps
SET 
  eth_reserve = (
    SELECT 
      COALESCE(t.initial_liquidity_eth, 0) + 
      COALESCE((SELECT SUM(eth_in - eth_out) FROM swaps s 
                WHERE s.token_address = ps.token_address 
                AND s.block_number <= ps.block_number), 0)
    FROM tokens t
    WHERE t.token_address = ps.token_address
  ),
  token_reserve = (
    SELECT 
      (1000000 * t.liquidity_percent::numeric / 100) + 
      COALESCE((SELECT SUM(token_in - token_out) FROM swaps s
                WHERE s.token_address = ps.token_address 
                AND s.block_number <= ps.block_number), 0)
    FROM tokens t
    WHERE t.token_address = ps.token_address
  ),
  price_eth = (
    SELECT 
      (
        COALESCE(t.initial_liquidity_eth, 0) + 
        COALESCE((SELECT SUM(eth_in - eth_out) FROM swaps s2 
                  WHERE s2.token_address = ps.token_address 
                  AND s2.block_number <= ps.block_number), 0)
      ) / NULLIF(
        (1000000 * t.liquidity_percent::numeric / 100) + 
        COALESCE((SELECT SUM(token_in - token_out) FROM swaps s3
                  WHERE s3.token_address = ps.token_address 
                  AND s3.block_number <= ps.block_number), 0),
        0
      )
    FROM tokens t
    WHERE t.token_address = ps.token_address
  )
WHERE EXISTS (
  SELECT 1 FROM swaps s
  WHERE s.token_address = ps.token_address
  AND s.block_number = ps.block_number
);

-- Log results
DO $$
DECLARE
  updated_count INT;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % price snapshots with correct reserves', updated_count;
END $$;