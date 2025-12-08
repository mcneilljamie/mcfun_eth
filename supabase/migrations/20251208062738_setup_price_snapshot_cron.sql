/*
  # Setup Automated Price Snapshot Collection

  1. Extensions
    - Enable pg_cron extension for scheduled jobs
    - Enable pg_net extension for HTTP requests
  
  2. Scheduled Job
    - Creates a cron job that runs every hour
    - Calls the price-snapshot edge function to collect price data
    - This will build up 7 days of historical data over time
  
  3. Notes
    - The job runs at minute 0 of every hour (e.g., 1:00, 2:00, 3:00)
    - This ensures continuous price tracking for all tokens
    - Historical data will accumulate over the next 7 days
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant permissions to postgres role for pg_cron
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a function to call the price-snapshot edge function
CREATE OR REPLACE FUNCTION call_price_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings are not available, try to use default URL pattern
  IF supabase_url IS NULL THEN
    -- This will be set by Supabase automatically in production
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  -- Call the edge function using pg_net
  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/price-snapshot',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  END IF;
END;
$$;

-- Schedule the job to run every hour at minute 0
SELECT cron.schedule(
  'price-snapshot-hourly',
  '0 * * * *',
  $$SELECT call_price_snapshot()$$
);
