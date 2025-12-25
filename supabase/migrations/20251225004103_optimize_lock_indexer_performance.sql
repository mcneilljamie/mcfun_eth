/*
  # Optimize Lock Indexer Performance

  1. Changes
    - Reduce lock-event-indexer frequency from every 5 seconds to every 60 seconds
    - This significantly reduces system load while maintaining reasonable sync time
    - For 1000+ locks, checking every minute is more than sufficient

  2. Impact
    - Reduces database queries by 92% (from 12 per minute to 1 per minute)
    - Prevents cron job queue buildup
    - Maintains fresh data (1-minute lag is acceptable for lock data)
*/

-- Drop the existing fast lock-event-indexer job
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'index-lock-events';
END $$;

-- Create new optimized lock-event-indexer job (every 60 seconds)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized'
  ) THEN
    PERFORM cron.schedule(
      'index-lock-events-optimized',
      '0 * * * * *',  -- Every minute at :00 seconds
      $CRON$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/lock-event-indexer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 45000
      );
      $CRON$
    );
  END IF;
END $$;
