/*
  # Add Launch ETH Price to Tokens Table
  
  1. Changes
    - Add `launch_eth_price_usd` column to store ETH price at token launch
    - Backfill data from first price snapshot for each token
    
  2. Purpose
    - Fix price change calculations to use correct historical ETH price
    - Currently using current ETH price causes -2% to -8% errors
    - Ensures 24h price changes match what users see on the chart
*/

-- Add column to store ETH price at launch
ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS launch_eth_price_usd NUMERIC(18, 2);

-- Backfill launch ETH prices from first snapshot for each token
UPDATE tokens t
SET launch_eth_price_usd = (
  SELECT ps.eth_price_usd
  FROM price_snapshots ps
  WHERE ps.token_address = t.token_address
  ORDER BY ps.created_at ASC
  LIMIT 1
)
WHERE launch_eth_price_usd IS NULL;
