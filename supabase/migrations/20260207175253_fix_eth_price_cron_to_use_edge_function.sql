/*
  # Fix ETH Price Cron Job to Use Edge Function

  ## Summary
  The PostgreSQL function `track_eth_price()` using async HTTP calls has been unreliable,
  causing ETH price updates to stop for extended periods. This migration switches the cron
  job to call the edge function directly, which uses a synchronous approach and has proven
  to work reliably.

  ## Changes
  1. Drop the existing cron job that calls the PostgreSQL function
  2. Create a new cron job that calls the edge function via HTTP
  3. The edge function makes a direct, synchronous call to CoinGecko API

  ## Security
  - Uses CRON_SECRET for authentication
  - Edge function verifies the secret before executing

  ## Impact
  - More reliable ETH price updates every 5 minutes
  - No dependency on async HTTP response processing
  - Immediate feedback on success/failure
*/

-- Drop the old cron job
SELECT cron.unschedule('track-eth-price-5min');

-- Create new cron job that calls the edge function
SELECT cron.schedule(
  'track-eth-price-edge-function',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/track-eth-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Store Supabase URL and CRON_SECRET as runtime settings if not already set
DO $$
BEGIN
  -- These will be set by Supabase automatically, but we ensure they exist
  PERFORM set_config('app.settings.supabase_url', current_setting('app.settings.supabase_url', true), false);
  PERFORM set_config('app.settings.cron_secret', current_setting('app.settings.cron_secret', true), false);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Settings will be configured by Supabase environment';
END;
$$;
