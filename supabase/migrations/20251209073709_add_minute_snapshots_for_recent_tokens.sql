/*
  # Add Minute-by-Minute Price Snapshots for Recent Tokens

  1. Overview
    - Creates a cron job that runs every minute for tokens launched within the last 24 hours
    - Provides high-resolution price data during the critical first 24 hours after launch
    - Works alongside the existing hourly snapshot job for older tokens

  2. New Scheduled Job
    - Runs every minute using cron expression
    - Calls price-snapshot edge function with onlyRecentTokens parameter set to true
    - Only processes tokens created within the last 24 hours
    - Automatically stops processing tokens once they exceed 24 hours old

  3. Benefits
    - Better price resolution during the most volatile period after launch
    - Smoother charts for newly launched tokens
    - Minimal additional load since it only processes recent tokens
*/

-- Create a function to call the price-snapshot edge function for recent tokens only
CREATE OR REPLACE FUNCTION call_price_snapshot_recent()
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
  
  -- Call the edge function using pg_net with onlyRecentTokens flag
  IF supabase_url IS NOT NULL AND service_role_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/price-snapshot',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('onlyRecentTokens', true)
    );
  END IF;
END;
$$;

-- Schedule the job to run every minute for recent tokens
SELECT cron.schedule(
  'price-snapshot-minute-recent',
  '* * * * *',
  $$SELECT call_price_snapshot_recent()$$
);
