/*
  # Simplify to 60-Second Universal Token Indexing

  1. Changes
    - Remove all tier-specific cron jobs (hot, warm, cold, dormant)
    - Remove tier update job
    - Create single cron job that runs every 60 seconds
    - All tokens checked universally at same frequency

  2. Benefits
    - Massive simplification: no tier management complexity
    - Consistent user experience: all tokens updated at same frequency
    - Easier debugging: single code path instead of 4 tier paths
    - Predictable RPC usage: linear scaling with token count
    - Still efficient: per-token block tracking prevents redundant scans

  3. Rationale
    - Tier system was designed for 1000+ tokens
    - For <200-300 tokens, universal 60s check is simpler and sufficient
    - Per-token block tracking is the real efficiency win
    - Checking a token with no new swaps is very cheap
*/

-- Remove all tier-specific indexer cron jobs
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname LIKE 'indexer-%' OR jobname = 'update-activity-tiers'
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_record.jobid);
      RAISE NOTICE 'Dropped job: % (id: %)', job_record.jobname, job_record.jobid;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not drop job %: %', job_record.jobname, SQLERRM;
    END;
  END LOOP;
END $$;

-- Create single universal indexer job that runs every minute
SELECT cron.schedule(
  'universal-indexer',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
