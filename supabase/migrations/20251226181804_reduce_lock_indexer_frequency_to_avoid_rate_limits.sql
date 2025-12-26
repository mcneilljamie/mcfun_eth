/*
  # Reduce Lock Indexer Frequency to Avoid Rate Limits

  1. Changes
    - Update lock event indexer cron job to run every 30 seconds (reduced from 5 seconds)
    - Prevents rate limiting from RPC providers
    - Still provides timely updates (30 second delay is acceptable)

  2. Rationale
    - Running every 5 seconds was causing 429 rate limit errors
    - Public RPC endpoints have 600 requests/60 seconds limit
    - With multiple indexers + frontend requests, we were exceeding limits
    - 30 seconds provides good balance between timeliness and rate limits

  3. Performance Impact
    - Locked tokens will appear within 30 seconds instead of 5 seconds
    - Significantly reduces RPC call volume
    - Reduces database load
    - Improves overall system reliability
*/

-- Update the lock indexer to run every 30 seconds
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'index-lock-events-optimized'),
  schedule := '*/30 * * * * *'
);

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Lock event indexer frequency reduced to every 30 seconds to avoid rate limiting';
END $$;
