/*
  # Increase Lock Indexer Frequency to Every 2 Minutes

  1. Changes
    - Update lock indexer from every 10 minutes to every 2 minutes
    - Add catchup job to run every 4 hours for historical gaps
    - Faster response time for new locks while avoiding rate limits

  2. Rationale
    - 10 minutes is too slow, causing multi-hour gaps in lock detection
    - 2 minutes provides good responsiveness (max 240 blocks behind on Sepolia)
    - Lock indexer has adaptive processing and lock protection to handle load
    - Catchup job ensures no historical locks are missed

  3. Updated Schedules
    - index-lock-events-optimized: every 10 minutes → every 2 minutes
    - index-lock-events-catchup: Added, runs every 4 hours
*/

-- Update lock indexer to run every 2 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
      schedule := '*/2 * * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-optimized to run every 2 minutes';
  END IF;
END $$;

-- Add catchup job if missing (runs every 4 hours)
DO $$
DECLARE
  v_url text;
  v_key text;
  v_command text;
BEGIN
  -- Get configuration values
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.supabase_service_role_key', true);
  
  -- First, remove any existing catchup job
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-catchup') THEN
    PERFORM cron.unschedule('index-lock-events-catchup');
    RAISE NOTICE 'Removed existing index-lock-events-catchup job';
  END IF;

  -- Build command
  v_command := format(
    'SELECT net.http_post(url := %L || ''/functions/v1/lock-event-indexer'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || %L), body := jsonb_build_object(''catchup'', true, ''force'', true))',
    v_url,
    v_key
  );

  -- Create new catchup job
  PERFORM cron.schedule(
    'index-lock-events-catchup',
    '0 */4 * * *',
    v_command
  );
  RAISE NOTICE 'Created index-lock-events-catchup job to run every 4 hours';
END $$;

-- Reset any stale is_active flags from previous runs
UPDATE lock_indexer_state
SET is_active = false
WHERE indexer_name = 'lock_indexer'
  AND is_active = true
  AND last_indexed_at < NOW() - INTERVAL '10 minutes';
