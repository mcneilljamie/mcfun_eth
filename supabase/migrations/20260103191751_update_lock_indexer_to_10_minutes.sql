/*
  # Update Lock Indexer to Run Every 10 Minutes

  1. Changes
    - Update lock indexer frequency from every 60 seconds to every 10 minutes
    - Update lock withdrawal sync from every 5 minutes to every 15 minutes
    - Keep lock catchup at every 12 hours (it's a full historical scan)

  2. Rationale
    - Balance between timely updates and RPC efficiency
    - 10 minutes provides good responsiveness without excessive API calls
    - Lock events are less frequent than swaps, so 10-minute intervals are reasonable

  3. Updated Schedules
    - index-lock-events-optimized: every 60 seconds → every 10 minutes
    - sync-lock-withdrawal-status-v1: every 5 minutes → every 15 minutes
    - index-lock-events-catchup: every 12 hours (unchanged)
*/

-- Update lock indexer to run every 10 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
      schedule := '*/10 * * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-optimized to run every 10 minutes';
  END IF;
END $$;

-- Update lock withdrawal sync to run every 15 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1'),
      schedule := '*/15 * * * *'
    );
    RAISE NOTICE 'Updated sync-lock-withdrawal-status-v1 to run every 15 minutes';
  END IF;
END $$;
