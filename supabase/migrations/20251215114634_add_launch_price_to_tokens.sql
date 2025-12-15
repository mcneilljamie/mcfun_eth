/*
  # Add Launch Price to Tokens

  1. Changes
    - Add `launch_price_eth` column to store the actual AMM calculation price at launch
    - This represents initial_liquidity_eth / 1,000,000 (the true launch price)
    - Backfill existing tokens with their calculated launch price
  
  2. Purpose
    - Enable accurate "since launch" price change calculations
    - Previously used first snapshot (interpolated data from 24h before launch)
    - Now uses the actual AMM price at the moment of token creation
*/

-- Add column to store the actual launch price
ALTER TABLE tokens 
ADD COLUMN IF NOT EXISTS launch_price_eth NUMERIC(36, 18);

-- Backfill launch prices for existing tokens
UPDATE tokens
SET launch_price_eth = (initial_liquidity_eth::NUMERIC / 1000000)
WHERE launch_price_eth IS NULL;
