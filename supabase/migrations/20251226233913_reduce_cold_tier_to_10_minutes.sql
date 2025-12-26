/*
  # Reduce Cold Tier Indexing to 10 Minutes

  1. Change
    - Update cold tier indexer from every 15 minutes to every 10 minutes
    - This provides faster chart updates for moderately active tokens

  2. Rationale
    - Cold tokens (swapped within 7 days) currently wait up to 15 minutes
    - 10 minutes provides better responsiveness for tokens with moderate activity
    - Small increase in frequency (1.5x) with minimal RPC overhead
    - Better balance between dormant (15min) and warm (2min) tiers

  3. Benefits
    - Faster chart updates for moderately active tokens
    - Better user experience when trading cold tier tokens
    - More responsive system overall while maintaining efficient resource usage
*/

-- Remove existing cold tier job
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname = 'indexer-cold'
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

-- COLD TIER: Every 10 minutes (no activity in last 24 hours, but active within 7 days)
SELECT cron.schedule(
  'indexer-cold',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "cold", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
