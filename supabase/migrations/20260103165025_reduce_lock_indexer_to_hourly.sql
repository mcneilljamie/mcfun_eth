/*
  # Reduce Lock Indexer Frequency to Hourly

  1. Changes
    - Reduce lock indexer frequency from every 15 minutes to every 60 minutes (1 hour)
    - Reduce lock withdrawal sync from every 30 minutes to every 2 hours
    - Reduce lock catchup frequency from every 6 hours to every 12 hours

  2. Rationale
    - Locks don't change frequently, so hourly updates are sufficient
    - Dramatically reduces RPC provider load (75% reduction in calls)
    - Prevents rate limiting issues that are causing errors
    - Still provides timely updates for lock status changes

  3. Updated Schedules
    - index-lock-events-optimized: every 15 min → every 60 min (hourly)
    - sync-lock-withdrawal-status-v1: every 30 min → every 2 hours
    - index-lock-events-catchup: every 6 hours → every 12 hours
*/

-- Update lock indexer to run every hour
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
      schedule := '0 * * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-optimized to run hourly';
  END IF;
END $$;

-- Update lock withdrawal sync to run every 2 hours
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1'),
      schedule := '0 */2 * * *'
    );
    RAISE NOTICE 'Updated sync-lock-withdrawal-status-v1 to run every 2 hours';
  END IF;
END $$;

-- Update lock catchup to run every 12 hours
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-catchup') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-catchup'),
      schedule := '0 */12 * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-catchup to run every 12 hours';
  END IF;
END $$;
