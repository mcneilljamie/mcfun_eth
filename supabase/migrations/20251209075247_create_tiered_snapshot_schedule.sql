/*
  # Create Tiered Price Snapshot Schedule
  
  1. Problem
    - Need different snapshot frequencies for different token ages
    - Minute-by-minute only needed for very recent tokens
    - Hourly is too infrequent for tokens < 7 days old
  
  2. Solution - Three-Tier System
    - Every 1 minute: Tokens < 24 hours old (high volatility period)
    - Every 10 minutes: Tokens 24 hours - 7 days old (moderate activity)
    - Every 1 hour: Tokens > 7 days old (established tokens)
  
  3. Implementation
    - Create three database functions that call the edge function via pg_net
    - Set up three cron jobs with different schedules
    - Each function filters tokens by age
*/

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call price snapshot edge function for tokens < 24 hours old
CREATE OR REPLACE FUNCTION snapshot_recent_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
BEGIN
  -- Get the Supabase URL from environment or use default
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    -- Try to construct from database settings
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  -- If still null, we can't proceed
  IF supabase_url IS NULL OR supabase_url = 'https://.supabase.co' THEN
    RAISE NOTICE 'Supabase URL not configured, skipping snapshot';
    RETURN;
  END IF;

  -- Make HTTP request to edge function with onlyRecentTokens filter
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/price-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('onlyRecentTokens', true)
  ) INTO request_id;
  
  RAISE NOTICE 'Snapshot request sent for recent tokens: %', request_id;
END;
$$;

-- Function to call price snapshot for tokens 1-7 days old
CREATE OR REPLACE FUNCTION snapshot_week_old_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  IF supabase_url IS NULL OR supabase_url = 'https://.supabase.co' THEN
    RAISE NOTICE 'Supabase URL not configured, skipping snapshot';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/price-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('tokenAgeFilter', 'week')
  ) INTO request_id;
  
  RAISE NOTICE 'Snapshot request sent for week-old tokens: %', request_id;
END;
$$;

-- Function to call price snapshot for all tokens (for hourly snapshots)
CREATE OR REPLACE FUNCTION snapshot_all_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co';
  END IF;
  
  IF supabase_url IS NULL OR supabase_url = 'https://.supabase.co' THEN
    RAISE NOTICE 'Supabase URL not configured, skipping snapshot';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/price-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object()
  ) INTO request_id;
  
  RAISE NOTICE 'Snapshot request sent for all tokens: %', request_id;
END;
$$;

-- Schedule cron jobs with different frequencies
-- Every 1 minute for tokens < 24 hours old
SELECT cron.schedule(
  'snapshot-recent-1min',
  '* * * * *',
  'SELECT snapshot_recent_tokens()'
);

-- Every 10 minutes for tokens 1-7 days old  
SELECT cron.schedule(
  'snapshot-week-10min',
  '*/10 * * * *',
  'SELECT snapshot_week_old_tokens()'
);

-- Every hour for all tokens (includes older tokens)
SELECT cron.schedule(
  'snapshot-all-hourly',
  '0 * * * *',
  'SELECT snapshot_all_tokens()'
);
