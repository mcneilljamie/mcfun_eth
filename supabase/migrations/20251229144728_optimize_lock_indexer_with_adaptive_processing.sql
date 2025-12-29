/*
  # Optimize Lock Indexer with Adaptive Processing

  1. Changes
    - Remove the lock-indexer-catchup cron job (no longer needed)
    - Update main indexer frequency from every 15 minutes to every 5 minutes
    - The indexer now uses adaptive batch sizing based on how far behind it is

  2. Adaptive Processing Logic
    - When >5000 blocks behind: processes 5000 blocks per run
    - When 1000-5000 blocks behind: processes 2000 blocks per run
    - When 500-1000 blocks behind: processes 1000 blocks per run
    - When <500 blocks behind: processes 500 blocks per run

  3. Performance Improvements
    - Reduced rate limiting (only 100ms per metadata cache miss instead of 300ms)
    - Removed aggressive 2000ms pause every 5 events
    - Added stale lock detection (resets is_active if stuck for >5 minutes)
    - Tracks performance metrics (blocks/sec, blocks_behind, processing_time)

  4. Rationale
    - Adaptive processing allows indexer to catch up quickly when behind
    - No need for separate catchup job with adaptive logic
    - More frequent runs (every 5 min) keep indexer current
    - System self-heals and stays synchronized automatically
*/

-- Remove the catchup cron job (no longer needed with adaptive processing)
SELECT cron.unschedule('lock-indexer-catchup');

-- Update main lock indexer to run every 5 minutes instead of 15
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
  schedule := '*/5 * * * *'
);
