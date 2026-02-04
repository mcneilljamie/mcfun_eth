/*
  # Revert to Real-Time ETH Prices

  ## Summary
  Removes fake ETH price history and reconfigures the system to use accurate
  real-time ETH prices for each snapshot, eliminating artificial chart movements.

  ## Problem
  - eth_price_history has 45,728 fake entries at $2,960.1
  - price_snapshots all use wrong ETH prices
  - Tokens table has wrong launch_eth_price_usd values
  - Charts show fake price movements

  ## Solution
  1. Clear fake ETH price history (keep only recent real data)
  2. Reset launch_eth_price_usd to NULL (will be calculated correctly)
  3. Delete all price snapshots (will be regenerated with correct ETH prices)
  4. Let the system rebuild with real-time ETH price data

  ## Impact
  - Charts will show accurate historical data
  - Each snapshot will use the actual ETH price at that time
  - No more artificial price declines or gains
*/

-- Clear fake ETH price history (keep only real recent entries)
DELETE FROM eth_price_history
WHERE price_usd = 2960.1;

-- Reset launch ETH prices (will be recalculated)
UPDATE tokens
SET launch_eth_price_usd = NULL;

-- Clear all price snapshots (will be regenerated)
DELETE FROM price_snapshots;

-- Log what we did
DO $$
BEGIN
  RAISE NOTICE 'Cleared fake ETH price history and reset system for accurate data collection';
END $$;