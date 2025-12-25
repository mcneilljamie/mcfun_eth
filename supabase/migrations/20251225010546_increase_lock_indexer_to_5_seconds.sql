/*
  # Increase lock indexer frequency to 5 seconds

  1. Changes
    - Update lock event indexer cron job to run every 5 seconds instead of once per minute
    - This ensures locked tokens appear on the site within seconds instead of up to a minute

  2. Performance
    - Matches the main event indexer frequency
    - Provides near real-time updates for lock events
*/

-- Update the lock indexer to run every 5 seconds
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
  schedule := '*/5 * * * * *'
);