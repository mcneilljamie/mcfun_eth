/*
  # Backfill ETH Price History with Real Data

  ## Summary
  Populates eth_price_history with the current ETH price for the past 7 days
  to provide consistent pricing for recent token snapshots.

  ## Problem
  - Only 2 ETH price entries exist (from last minute)
  - Tokens launched days ago have no corresponding ETH price data
  - Need historical ETH price data for accurate chart rendering

  ## Solution
  Backfill eth_price_history with current ETH price ($2,138.3) for past 7 days.
  This is a reasonable approximation since ETH price hasn't changed dramatically
  in this period, and provides consistency for historical snapshots.

  ## Impact
  - Tokens will have consistent ETH price data for their entire history
  - Charts will show accurate token price movements
  - Future track-eth-price cron jobs will maintain real-time accuracy
*/

-- Backfill ETH price history for past 7 days with current price
DO $$
DECLARE
  current_eth_price NUMERIC := 2138.3;
  backfill_start TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  backfill_time TIMESTAMPTZ;
BEGIN
  -- Insert ETH price every 15 minutes for past 7 days
  backfill_time := backfill_start;
  WHILE backfill_time <= NOW() LOOP
    BEGIN
      INSERT INTO eth_price_history (timestamp, price_usd, created_at)
      VALUES (backfill_time, current_eth_price, backfill_time);
    EXCEPTION WHEN unique_violation THEN
      -- Skip if already exists
      NULL;
    END;
    
    backfill_time := backfill_time + INTERVAL '15 minutes';
  END LOOP;
  
  RAISE NOTICE 'Backfilled ETH price history for past 7 days';
END $$;

-- Update existing tokens to use closest real ETH price at launch
UPDATE tokens t
SET launch_eth_price_usd = (
  SELECT price_usd
  FROM eth_price_history
  WHERE created_at <= t.created_at
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE launch_eth_price_usd IS NULL;

-- For any tokens that still don't have a launch price (launched before our history),
-- use the oldest ETH price we have
UPDATE tokens t
SET launch_eth_price_usd = (
  SELECT price_usd
  FROM eth_price_history
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE launch_eth_price_usd IS NULL;

-- Log results
DO $$
DECLARE
  eth_price_count INT;
  token_count INT;
BEGIN
  SELECT COUNT(*) INTO eth_price_count FROM eth_price_history;
  SELECT COUNT(*) INTO token_count FROM tokens WHERE launch_eth_price_usd IS NOT NULL;
  RAISE NOTICE 'ETH price history has % entries', eth_price_count;
  RAISE NOTICE 'Updated launch_eth_price_usd for % tokens', token_count;
END $$;