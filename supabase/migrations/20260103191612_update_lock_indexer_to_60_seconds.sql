/*
  # Update Lock Indexer to Run Every 60 Seconds

  1. Changes
    - Update lock indexer frequency from every 60 minutes (hourly) to every 60 seconds
    - Update lock withdrawal sync from every 2 hours to every 5 minutes
    - Keep lock catchup at every 12 hours (it's a full historical scan)

  2. Rationale
    - Match the swap indexer frequency (60 seconds) for consistency
    - Users expect to see locks appear quickly after transaction
    - Lock indexer is optimized with per-token block tracking
    - Only checks tokens that have had activity recently
    - Minimal RPC load since most checks return early (no new blocks)

  3. Updated Schedules
    - index-lock-events-optimized: every 60 min → every 60 seconds
    - sync-lock-withdrawal-status-v1: every 2 hours → every 5 minutes
    - index-lock-events-catchup: every 12 hours (unchanged)
*/

-- Update lock indexer to run every 60 seconds
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
      schedule := '* * * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-optimized to run every 60 seconds';
  END IF;
END $$;

-- Update lock withdrawal sync to run every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1'),
      schedule := '*/5 * * * *'
    );
    RAISE NOTICE 'Updated sync-lock-withdrawal-status-v1 to run every 5 minutes';
  END IF;
END $$;
