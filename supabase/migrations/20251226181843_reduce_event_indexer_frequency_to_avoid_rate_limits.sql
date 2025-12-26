/*
  # Reduce Event Indexer Frequency to Avoid Rate Limits

  1. Changes
    - Remove all 60 per-second event indexer cron jobs
    - Create 6 cron jobs running every 10 seconds (staggered)
    - Reduces RPC call volume by 90%

  2. Rationale
    - 60 jobs per minute + other indexers = rate limit overload
    - Public RPC endpoints limit: 600 requests/60 seconds
    - With multiple indexers + price snapshots + frontend = exceeding limits
    - 10 second interval provides good balance

  3. Performance Impact
    - Events will appear within 10 seconds instead of 1 second
    - 10 seconds is still excellent for user experience
    - Significantly reduces RPC call volume and rate limit errors
    - Improves overall system reliability

  4. Implementation
    - 6 jobs staggered at 0, 10, 20, 30, 40, 50 second intervals
    - Provides consistent 10-second granularity
*/

-- First, try to drop all existing per-second event indexer jobs
DO $$
DECLARE
  i INTEGER;
  job_name TEXT;
BEGIN
  FOR i IN 0..59 LOOP
    job_name := 'event-indexer-job-' || LPAD(i::TEXT, 2, '0');
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Dropped job: %', job_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Job % does not exist or already dropped', job_name;
    END;
  END LOOP;
END $$;

-- Create 6 new jobs running every 10 seconds
DO $$
DECLARE
  i INTEGER;
  job_command TEXT;
  schedule_pattern TEXT;
  job_name TEXT;
BEGIN
  FOR i IN 0..5 LOOP
    job_name := 'event-indexer-10s-' || i::TEXT;
    
    -- Create schedule pattern for every minute
    schedule_pattern := '* * * * *';
    
    -- Build command with sleep to stagger execution
    job_command := 'SELECT pg_sleep(' || (i * 10)::TEXT || '); ' ||
                   'SELECT net.http_post(' ||
                   'url := (SELECT current_setting(''app.settings.supabase_url'') || ''/functions/v1/event-indexer''), ' ||
                   'headers := jsonb_build_object(' ||
                   '''Content-Type'', ''application/json'', ' ||
                   '''Authorization'', ''Bearer '' || (SELECT current_setting(''app.settings.supabase_service_role_key''))' ||
                   '), ' ||
                   'body := ''{}''::jsonb' ||
                   ');';
    
    -- Schedule the job
    PERFORM cron.schedule(
      job_name,
      schedule_pattern,
      job_command
    );
    
    RAISE NOTICE 'Created job: % with %s delay', job_name, (i * 10);
  END LOOP;
END $$;

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Event indexer frequency reduced from every 1 second to every 10 seconds to avoid rate limiting';
  RAISE NOTICE 'This reduces RPC call volume by 90%% while maintaining excellent user experience';
END $$;
