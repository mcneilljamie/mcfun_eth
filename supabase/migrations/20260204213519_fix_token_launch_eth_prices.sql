/*
  # Fix Token Launch ETH Prices

  ## Summary
  Corrects the launch_eth_price_usd values in the tokens table to match the actual
  ETH price at the time each token was launched. This fixes artificial chart declines
  caused by mismatched ETH prices between launch and current snapshots.

  ## Problem
  - Tokens have launch_eth_price_usd = 3300 (old hardcoded value)
  - Price snapshots now use correct ETH price (2138-2960 range)
  - Charts show fake "declines" because launch price uses wrong ETH price
  - Example: EPSTEIN shows -32% decline but only had 2 buys

  ## Solution
  Update each token's launch_eth_price_usd to the actual ETH price at launch time
  by finding the closest ETH price in eth_price_history.

  ## Impact
  - Charts will show accurate price history from launch
  - Eliminates artificial price declines
  - Launch market caps will be correctly calculated
*/

-- Update all tokens to use the correct ETH price at their launch time
UPDATE tokens t
SET launch_eth_price_usd = (
  SELECT COALESCE(
    (SELECT price_usd 
     FROM eth_price_history 
     WHERE created_at <= t.created_at 
     ORDER BY created_at DESC 
     LIMIT 1),
    2960.1  -- Fallback to the baseline ETH price if no match found
  )
)
WHERE launch_eth_price_usd::numeric != (
  SELECT COALESCE(
    (SELECT price_usd::numeric
     FROM eth_price_history 
     WHERE created_at <= t.created_at 
     ORDER BY created_at DESC 
     LIMIT 1),
    2960.1
  )
);

-- Log the results
DO $$
DECLARE
  updated_count INT;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated launch_eth_price_usd for % tokens', updated_count;
END $$;