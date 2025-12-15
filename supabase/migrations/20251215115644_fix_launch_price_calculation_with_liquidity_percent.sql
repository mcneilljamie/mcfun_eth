/*
  # Fix Launch Price Calculation to Account for Liquidity Percent

  1. Problem
    - Launch price was calculated as initial_liquidity_eth / 1,000,000
    - This is WRONG because tokens can launch with 50-100% liquidity
    - If 50% liquidity: pool starts with 500,000 tokens (not 1,000,000)
    - Actual launch price should be: initial_liquidity_eth / (1,000,000 * liquidity_percent / 100)
  
  2. Changes
    - Recalculate launch_price_eth using actual token liquidity in pool
    - This fixes the "since launch" price change to show accurate returns
  
  3. Example
    - Token with 0.1 ETH and 50% liquidity:
    - OLD (wrong): 0.1 / 1,000,000 = 0.0000001 ETH per token
    - NEW (correct): 0.1 / 500,000 = 0.0000002 ETH per token
*/

-- Recalculate launch prices for all tokens using correct formula
UPDATE tokens
SET launch_price_eth = (
  initial_liquidity_eth::NUMERIC / 
  (1000000 * liquidity_percent / 100)
);
