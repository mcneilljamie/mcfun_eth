/*
  # Reduce Lock Indexer Cron Job Frequencies

  1. Changes
    - Reduce lock indexer frequency from every 2 minutes to every 15 minutes
    - Reduce lock withdrawal sync from every 10 minutes to every 30 minutes

  2. Rationale
    - Lock indexer catchup job runs every 6 hours as a safety net
    - Regular indexer only needs to run periodically since catchup handles gaps
    - Reduces RPC provider load and database activity
    - System stays synchronized with less frequent polling

  3. Updated Schedules
    - index-lock-events-optimized: every 2 min to every 15 min
    - sync-lock-withdrawal-status-v1: every 10 min to every 30 min
*/

-- Update lock indexer to run every 15 minutes
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
  schedule := '*/15 * * * *'
);

-- Update lock withdrawal sync to run every 30 minutes
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-lock-withdrawal-status-v1'),
  schedule := '*/30 * * * *'
);