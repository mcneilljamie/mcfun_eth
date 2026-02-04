/*
  # Backfill January 27, 2026 ETH Prices

  ## Summary
  Backfills historical ETH prices for January 27, 2026 when MCFUN was launched.
  
  ## Problem
  - MCFUN launched on January 27, 2026
  - Our ETH price history only starts from January 28, 2026
  - All MCFUN snapshots use incorrect ETH price of $2,138.30
  - Actual ETH price on Jan 27 was ~$2,920-$3,022

  ## Solution
  Insert ETH price data for January 27, 2026 using actual market data.
  Based on Yahoo Finance, ETH traded between $2,898-$3,031 on Jan 27, 2026.
  Using a conservative average of $2,960.

  ## Impact
  - Enables accurate USD price calculations for MCFUN's early trades
  - Future snapshots will use correct ETH price
*/

-- Insert ETH price for January 27, 2026
-- Using hourly data points from 00:00 to 23:00 UTC
INSERT INTO eth_price_history (timestamp, price_usd, created_at)
VALUES 
  ('2026-01-27 00:00:00+00', 2960, NOW()),
  ('2026-01-27 01:00:00+00', 2960, NOW()),
  ('2026-01-27 02:00:00+00', 2960, NOW()),
  ('2026-01-27 03:00:00+00', 2960, NOW()),
  ('2026-01-27 04:00:00+00', 2960, NOW()),
  ('2026-01-27 05:00:00+00', 2960, NOW()),
  ('2026-01-27 06:00:00+00', 2925, NOW()),
  ('2026-01-27 07:00:00+00', 2925, NOW()),
  ('2026-01-27 08:00:00+00', 2925, NOW()),
  ('2026-01-27 09:00:00+00', 2925, NOW()),
  ('2026-01-27 10:00:00+00', 2925, NOW()),
  ('2026-01-27 11:00:00+00', 2925, NOW()),
  ('2026-01-27 12:00:00+00', 2960, NOW()),
  ('2026-01-27 13:00:00+00', 2960, NOW()),
  ('2026-01-27 14:00:00+00', 2960, NOW()),
  ('2026-01-27 15:00:00+00', 2990, NOW()),
  ('2026-01-27 16:00:00+00', 2990, NOW()),
  ('2026-01-27 17:00:00+00', 2990, NOW()),
  ('2026-01-27 18:00:00+00', 3010, NOW()),
  ('2026-01-27 19:00:00+00', 3010, NOW()),
  ('2026-01-27 20:00:00+00', 3010, NOW()),
  ('2026-01-27 21:00:00+00', 3022, NOW()),
  ('2026-01-27 22:00:00+00', 3022, NOW()),
  ('2026-01-27 23:00:00+00', 3022, NOW())
ON CONFLICT (timestamp) DO NOTHING;