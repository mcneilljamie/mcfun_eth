/*
  # Create Tiered Event Indexer Cron Schedule

  1. Strategy
    - HOT tier: Runs every 10 seconds (6 jobs per minute)
    - WARM tier: Runs every 2 minutes
    - COLD tier: Runs every 15 minutes
    - DORMANT tier: Runs every hour
    - Token launches: Runs every 10 seconds (included in HOT tier jobs)

  2. Benefits
    - 90%+ reduction in RPC calls vs querying all tokens
    - Hot tokens get near-real-time updates
    - Cold/dormant tokens checked infrequently
    - Better RPC rate limit management

  3. Implementation
    - Remove old jobs running without tier parameter
    - Create tier-specific jobs
    - Add periodic tier update job to recalculate activity tiers
*/

-- Remove old event-indexer jobs
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN 
    SELECT jobid, jobname 
    FROM cron.job 
    WHERE jobname LIKE 'event-indexer%'
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

-- HOT TIER: 6 jobs every 10 seconds (most active tokens)
SELECT cron.schedule(
  'indexer-hot-0',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexTokenLaunches": true, "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

SELECT cron.schedule(
  'indexer-hot-1',
  '* * * * *',
  $$
  SELECT pg_sleep(10);
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

SELECT cron.schedule(
  'indexer-hot-2',
  '* * * * *',
  $$
  SELECT pg_sleep(20);
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

SELECT cron.schedule(
  'indexer-hot-3',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

SELECT cron.schedule(
  'indexer-hot-4',
  '* * * * *',
  $$
  SELECT pg_sleep(40);
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

SELECT cron.schedule(
  'indexer-hot-5',
  '* * * * *',
  $$
  SELECT pg_sleep(50);
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "hot", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- WARM TIER: Every 2 minutes (active in last 24 hours)
SELECT cron.schedule(
  'indexer-warm',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{"tier": "warm", "indexSwaps": true}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- COLD TIER: Every 15 minutes (active in last 7 days)
SELECT cron.schedule(
  'indexer-cold',
  '*/15 * * * *',
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

-- DORMANT TIER: Every hour (no activity in last 7 days)
SELECT cron.schedule(
  'indexer-dormant',
  '5 * * * *',
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

-- TIER UPDATE: Recalculate activity tiers every 5 minutes
SELECT cron.schedule(
  'update-activity-tiers',
  '*/5 * * * *',
  $$
  SELECT update_all_activity_tiers();
  $$
);