/*
  # Fix Price Snapshot Cron Job

  1. Changes
    - Drop the broken snapshot_all_tokens_15s function
    - Create a new cron job that properly calls the price-snapshot edge function
    - Uses pg_net extension to make HTTP requests to the edge function
  
  2. Notes
    - The edge function reads actual on-chain data from the blockchain
    - Runs every 15 seconds to capture price changes after trades
*/

-- Drop the old broken function
DROP FUNCTION IF EXISTS snapshot_all_tokens_15s();

-- Create a function that calls the edge function
CREATE OR REPLACE FUNCTION call_price_snapshot_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Get the Supabase URL and service role key from environment
  supabase_url := current_setting('app.settings.api_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings aren't available, try to construct the URL
  IF supabase_url IS NULL THEN
    supabase_url := 'https://' || current_setting('request.header.host', true);
  END IF;
  
  -- Make HTTP request to edge function
  IF supabase_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/price-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  END IF;
END;
$$;

-- Schedule the function to run every 15 seconds
SELECT cron.schedule(
  'call-price-snapshot-15s',
  '*/15 * * * * *',
  'SELECT call_price_snapshot_edge();'
);