/*
  # Use Launch ETH Price for All Token Snapshots

  ## Summary
  Updates all price snapshots to use the token's launch ETH price instead of
  the current market ETH price. This provides consistent USD pricing and
  eliminates artificial price declines caused by ETH price fluctuations.

  ## Problem
  - Historical snapshots were backfilled with current ETH price ($2,138)
  - Tokens launched when ETH was $2,960
  - Charts show fake declines even when token reserves are stable
  - Example: EPSTEIN shows -32% but only had 2 buys (reserves barely changed)

  ## Solution
  For each token, set all its snapshots' eth_price_usd to match the token's
  launch_eth_price_usd. This keeps USD prices consistent and only shows actual
  token price movements, not ETH price movements.

  ## Impact
  - Charts will show true token price changes
  - Eliminates artificial declines from ETH price changes
  - Market caps will be consistent with launch values

  ## Note
  This is the correct approach for a token-specific DEX where we want to show
  token price movements independent of ETH price movements.
*/

-- Update all price snapshots to use their token's launch ETH price
UPDATE price_snapshots ps
SET eth_price_usd = (
  SELECT launch_eth_price_usd
  FROM tokens t
  WHERE t.token_address = ps.token_address
)
WHERE EXISTS (
  SELECT 1 FROM tokens t
  WHERE t.token_address = ps.token_address
  AND t.launch_eth_price_usd IS NOT NULL
);

-- Verify the update
DO $$
DECLARE
  updated_count INT;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % price snapshots to use launch ETH prices', updated_count;
END $$;