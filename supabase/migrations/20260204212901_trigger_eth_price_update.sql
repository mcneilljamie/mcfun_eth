/*
  # Trigger ETH Price Update

  ## Summary
  Manually triggers the track_eth_price function to fetch and store the current
  ETH price from CoinGecko API. This ensures we have an up-to-date price for
  subsequent backfill operations.

  ## Changes
  Calls the track_eth_price function directly from the migration.

  ## Impact
  - Fetches current ETH price (~$2,150)
  - Stores it in eth_price_history table
  - Makes the correct price available for backfill operations
*/

-- Call the track_eth_price function to get current price
SELECT track_eth_price();