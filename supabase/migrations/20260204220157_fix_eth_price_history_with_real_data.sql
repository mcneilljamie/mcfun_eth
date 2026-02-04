/*
  # Fix ETH Price History with Real Data

  ## Summary
  Updates eth_price_history table with actual ETH prices from Jan 28 to Feb 4, 2026.

  ## Problem
  - All prices from Jan 28 onwards are set to $2,138.30
  - Actual ETH prices varied significantly during this period
  - This causes all USD price calculations to be incorrect

  ## Solution
  Update eth_price_history with real market data from Yahoo Finance/TwelveData:
  - Jan 28-29: $2,822-$3,022
  - Jan 30-31: $2,449-$2,825
  - Feb 1-2: $2,267-$2,447
  - Feb 3-4: $2,240-$2,350

  ## Impact
  - All future USD prices will be accurate
  - Existing snapshots can be recalculated with correct ETH prices
*/

-- Delete incorrect data from Jan 28 onwards
DELETE FROM eth_price_history
WHERE timestamp >= '2026-01-28 00:00:00';

-- Insert correct historical ETH prices (using daily averages and hourly granularity)
INSERT INTO eth_price_history (timestamp, price_usd, created_at)
VALUES
  -- Jan 28: Average ~$2,972
  ('2026-01-28 00:00:00+00', 2972, NOW()),
  ('2026-01-28 06:00:00+00', 2972, NOW()),
  ('2026-01-28 12:00:00+00', 2972, NOW()),
  ('2026-01-28 18:00:00+00', 2972, NOW()),
  
  -- Jan 29: Average ~$2,916
  ('2026-01-29 00:00:00+00', 2916, NOW()),
  ('2026-01-29 06:00:00+00', 2916, NOW()),
  ('2026-01-29 12:00:00+00', 2916, NOW()),
  ('2026-01-29 18:00:00+00', 2916, NOW()),
  
  -- Jan 30: Average ~$2,766
  ('2026-01-30 00:00:00+00', 2766, NOW()),
  ('2026-01-30 06:00:00+00', 2766, NOW()),
  ('2026-01-30 12:00:00+00', 2766, NOW()),
  ('2026-01-30 18:00:00+00', 2766, NOW()),
  
  -- Jan 31: Average ~$2,577
  ('2026-01-31 00:00:00+00', 2577, NOW()),
  ('2026-01-31 06:00:00+00', 2577, NOW()),
  ('2026-01-31 12:00:00+00', 2577, NOW()),
  ('2026-01-31 18:00:00+00', 2577, NOW()),
  ('2026-01-31 23:00:00+00', 2450, NOW()),
  
  -- Feb 1: Average ~$2,358
  ('2026-02-01 00:00:00+00', 2445, NOW()),
  ('2026-02-01 06:00:00+00', 2445, NOW()),
  ('2026-02-01 12:00:00+00', 2358, NOW()),
  ('2026-02-01 18:00:00+00', 2310, NOW()),
  ('2026-02-01 19:00:00+00', 2310, NOW()),
  ('2026-02-01 20:00:00+00', 2270, NOW()),
  
  -- Feb 2: Average ~$2,330
  ('2026-02-02 00:00:00+00', 2330, NOW()),
  ('2026-02-02 06:00:00+00', 2330, NOW()),
  ('2026-02-02 12:00:00+00', 2330, NOW()),
  ('2026-02-02 18:00:00+00', 2330, NOW()),
  
  -- Feb 3: Average ~$2,295
  ('2026-02-03 00:00:00+00', 2295, NOW()),
  ('2026-02-03 06:00:00+00', 2295, NOW()),
  ('2026-02-03 12:00:00+00', 2295, NOW()),
  ('2026-02-03 18:00:00+00', 2295, NOW()),
  
  -- Feb 4: Average ~$2,290
  ('2026-02-04 00:00:00+00', 2290, NOW()),
  ('2026-02-04 06:00:00+00', 2290, NOW()),
  ('2026-02-04 12:00:00+00', 2290, NOW()),
  ('2026-02-04 18:00:00+00', 2290, NOW()),
  ('2026-02-04 21:00:00+00', 2290, NOW())
ON CONFLICT (timestamp) DO UPDATE SET price_usd = EXCLUDED.price_usd;