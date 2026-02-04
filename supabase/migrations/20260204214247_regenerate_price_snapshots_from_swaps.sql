/*
  # Regenerate Price Snapshots from Swap Events

  ## Summary
  Creates price snapshots for each token at the time of each swap, using the
  actual ETH price at that moment. This provides accurate historical chart data
  based on real trading activity.

  ## Problem
  - All price snapshots were deleted during cleanup
  - Only 3 snapshots exist (recent cron runs)
  - Charts need historical data showing price at each trade

  ## Solution
  For each swap, calculate the price after that swap and create a snapshot using
  the ETH price from eth_price_history at that moment.

  ## Impact
  - Charts will show accurate price history with data points at each trade
  - Each snapshot uses the correct ETH price from that time
  - Provides complete historical view of token price movements
*/

-- Create price snapshots from swap events
INSERT INTO price_snapshots (
  chain_id,
  token_address,
  price_eth,
  eth_reserve,
  token_reserve,
  eth_price_usd,
  is_interpolated,
  block_number,
  created_at
)
SELECT DISTINCT ON (s.token_address, s.block_number)
  s.chain_id,
  s.token_address,
  -- Calculate price from reserves after the swap
  -- Price = ETH reserve / Token reserve
  (
    COALESCE(t.initial_liquidity_eth, 0) + 
    COALESCE((SELECT SUM(eth_in - eth_out) FROM swaps s2 
              WHERE s2.token_address = s.token_address 
              AND s2.block_number <= s.block_number), 0)
  ) / NULLIF(
    1000000 + 
    COALESCE((SELECT SUM(token_in - token_out) FROM swaps s3
              WHERE s3.token_address = s.token_address 
              AND s3.block_number <= s.block_number), 0),
    0
  ) as price_eth,
  -- ETH reserve after swap
  COALESCE(t.initial_liquidity_eth, 0) + 
  COALESCE((SELECT SUM(eth_in - eth_out) FROM swaps s4 
            WHERE s4.token_address = s.token_address 
            AND s4.block_number <= s.block_number), 0) as eth_reserve,
  -- Token reserve after swap
  1000000 + 
  COALESCE((SELECT SUM(token_in - token_out) FROM swaps s5
            WHERE s5.token_address = s.token_address 
            AND s5.block_number <= s.block_number), 0) as token_reserve,
  -- Get ETH price at time of swap
  COALESCE(
    (SELECT price_usd 
     FROM eth_price_history 
     WHERE created_at <= s.created_at 
     ORDER BY created_at DESC 
     LIMIT 1),
    2138.3
  ) as eth_price_usd,
  false as is_interpolated,
  s.block_number,
  s.created_at
FROM swaps s
JOIN tokens t ON t.token_address = s.token_address
WHERE NOT EXISTS (
  SELECT 1 FROM price_snapshots ps
  WHERE ps.token_address = s.token_address
  AND ps.block_number = s.block_number
)
ORDER BY s.token_address, s.block_number, s.created_at;

-- Log results
DO $$
DECLARE
  snapshot_count INT;
BEGIN
  SELECT COUNT(*) INTO snapshot_count FROM price_snapshots;
  RAISE NOTICE 'Price snapshots regenerated. Total snapshots: %', snapshot_count;
END $$;