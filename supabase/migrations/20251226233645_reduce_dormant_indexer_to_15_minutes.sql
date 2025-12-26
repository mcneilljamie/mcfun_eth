/*
  # Reduce Dormant Token Indexing Delay to 15 Minutes

  1. Change
    - Update dormant tier indexer from hourly to every 15 minutes
    - This reduces maximum wait time for dormant token swaps to appear on charts

  2. Rationale
    - Dormant tokens currently wait up to 1 hour for updates
    - 15 minutes provides better user experience without significant RPC overhead
    - Dormant tokens have minimal activity by definition, so 4x frequency has low impact
    - Aligns dormant tier with same frequency as cold tier

  3. Benefits
    - Faster chart updates for all tokens
    - Better user experience when trading less active tokens
    - Maintains efficient resource usage through tiered system
*/

-- Remove existing dormant tier job
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname = 'indexer-dormant'
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

-- DORMANT TIER: Every 15 minutes (no activity in last 7 days)
SELECT cron.schedule(
  'indexer-dormant',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "dormant", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
