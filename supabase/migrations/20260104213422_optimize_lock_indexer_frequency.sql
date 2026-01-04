/*
  # Optimize Lock Indexer Frequency for Faster Catchup

  1. Changes
    - Reduce lock indexer frequency from 10 minutes to 2 minutes
    - This allows faster catchup while still avoiding rate limits

  2. Rationale
    - Current 10-minute interval is too slow for catching up on missed blocks
    - 2-minute intervals provide 5x faster catchup
    - Lock indexer already has adaptive block range logic that scales based on backlog
    - Internal rate limiting and retry logic prevent RPC exhaustion

  3. Updated Schedule
    - index-lock-events-optimized: every 10 minutes → every 2 minutes
*/

-- Update lock indexer to run every 2 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events-optimized') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
      schedule := '*/2 * * * *'
    );
    RAISE NOTICE 'Updated index-lock-events-optimized to run every 2 minutes for faster catchup';
  END IF;
END $$;
