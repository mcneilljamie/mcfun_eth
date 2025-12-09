/*
  # Create ETH Price Tracking Cron Job

  ## Summary
  Sets up automated tracking of Ethereum price in USD from CoinGecko API.
  Stores prices in eth_price_history table every minute to maintain
  accurate historical reference data for calculating token USD values.

  ## Changes
  1. Database Function
    - Creates function to call track-eth-price edge function
    - Uses pg_net for HTTP POST request
    - Stores current ETH price every minute

  2. Cron Job
    - Runs every minute (standard cron interval)
    - Independent of token price snapshots
    - Provides continuous ETH price baseline

  ## Notes
  - ETH price updates every minute regardless of token activity
  - Used by price-snapshot and interpolate-snapshots functions
  - CoinGecko API has rate limits (10-50 calls/minute on free tier)
  - This uses 1 call per minute = 1,440 calls per day (well within limits)
*/

-- Create function to track ETH price
CREATE OR REPLACE FUNCTION track_eth_price()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
BEGIN
  -- Get the Supabase URL
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  IF supabase_url IS NULL OR supabase_url = 'https://.supabase.co' THEN
    RAISE NOTICE 'Supabase URL not configured, skipping ETH price tracking';
    RETURN;
  END IF;

  -- Make HTTP request to edge function
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/track-eth-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object()
  ) INTO request_id;
  
  RAISE NOTICE 'ETH price tracking request sent: %', request_id;
END;
$$;

-- Schedule ETH price tracking every minute
SELECT cron.schedule(
  'track-eth-price-1min',
  '* * * * *',
  'SELECT track_eth_price()'
);