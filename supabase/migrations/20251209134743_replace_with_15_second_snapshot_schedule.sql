/*
  # Replace Tiered Cron with 15-Second Snapshot Schedule

  ## Summary
  Removes the three-tier cron system (1min/10min/1hour) and replaces it with
  a single high-frequency snapshot schedule that captures all tokens every 15 seconds.
  This provides near-real-time data for all tokens regardless of age.

  ## Changes
  1. Remove Old System
    - Unschedule three existing cron jobs (recent-1min, week-10min, all-hourly)
    - Drop three age-filtered database functions

  2. Create New System
    - Single database function that snapshots ALL tokens
    - Cron job running every minute that triggers 4 snapshot cycles
    - Each cycle separated by 15 seconds
    - Achieves effective 15-second snapshot frequency

  3. Implementation Details
    - Uses pg_sleep(15) to create 15-second delays between snapshots
    - Each minute produces 4 snapshots per token (at 0s, 15s, 30s, 45s)
    - No age filtering - all tokens get equal frequency
    - Asynchronous HTTP calls to edge function for parallel processing

  ## Notes
  - This creates 240 snapshots per token per hour (vs previous 1-60)
  - Much smoother charts with dense data points
  - May increase database load - monitor performance
  - If performance issues occur, reduce to 30-second intervals (2 cycles per minute)
*/

-- Unschedule existing cron jobs
SELECT cron.unschedule('snapshot-recent-1min');
SELECT cron.unschedule('snapshot-week-10min');
SELECT cron.unschedule('snapshot-all-hourly');

-- Drop old functions
DROP FUNCTION IF EXISTS snapshot_recent_tokens();
DROP FUNCTION IF EXISTS snapshot_week_old_tokens();
DROP FUNCTION IF EXISTS snapshot_all_tokens();

-- Create new high-frequency snapshot function
CREATE OR REPLACE FUNCTION snapshot_all_tokens_15s()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  cycle integer;
BEGIN
  -- Get the Supabase URL
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  IF supabase_url IS NULL OR supabase_url = 'https://.supabase.co' THEN
    RAISE NOTICE 'Supabase URL not configured, skipping snapshot';
    RETURN;
  END IF;

  -- Run 4 snapshot cycles per minute (0s, 15s, 30s, 45s)
  FOR cycle IN 1..4 LOOP
    -- Make HTTP request to edge function (processes all tokens)
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/price-snapshot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('snapshot_all', true)
    ) INTO request_id;
    
    RAISE NOTICE '15s snapshot cycle % completed: request_id=%', cycle, request_id;
    
    -- Wait 15 seconds before next cycle (except after last cycle)
    IF cycle < 4 THEN
      PERFORM pg_sleep(15);
    END IF;
  END LOOP;
  
  RAISE NOTICE 'All 4 snapshot cycles completed';
END;
$$;

-- Schedule the high-frequency snapshot function to run every minute
-- This will create 4 snapshots per minute (effectively 15-second intervals)
SELECT cron.schedule(
  'snapshot-all-15s',
  '* * * * *',
  'SELECT snapshot_all_tokens_15s()'
);