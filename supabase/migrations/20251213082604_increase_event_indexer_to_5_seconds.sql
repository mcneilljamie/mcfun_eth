/*
  # Increase Event Indexer to Every 5 Seconds
  
  1. Changes
    - Update event-indexer cron jobs to run every 5 seconds instead of every 30 seconds
    - This will make recent trades appear much faster in the UI (5x faster)
    - Creates 12 separate cron jobs, one triggering every 5 seconds
  
  2. Notes
    - pg_cron doesn't support sub-minute intervals in standard cron syntax
    - We create multiple jobs with staggered pg_sleep delays to achieve 5-second intervals
    - Jobs run at :00, :05, :10, :15, :20, :25, :30, :35, :40, :45, :50, :55 of each minute
*/

-- Drop existing cron jobs
SELECT cron.unschedule('event-indexer-job-00');
SELECT cron.unschedule('event-indexer-job-30');

-- Create 12 cron jobs that run every minute but with different delays (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 seconds)
-- This effectively gives us execution every 5 seconds

-- Job at :00 seconds
SELECT cron.schedule(
  'event-indexer-job-00',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :05 seconds
SELECT cron.schedule(
  'event-indexer-job-05',
  '* * * * *',
  $$
  SELECT pg_sleep(5);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :10 seconds
SELECT cron.schedule(
  'event-indexer-job-10',
  '* * * * *',
  $$
  SELECT pg_sleep(10);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :15 seconds
SELECT cron.schedule(
  'event-indexer-job-15',
  '* * * * *',
  $$
  SELECT pg_sleep(15);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :20 seconds
SELECT cron.schedule(
  'event-indexer-job-20',
  '* * * * *',
  $$
  SELECT pg_sleep(20);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :25 seconds
SELECT cron.schedule(
  'event-indexer-job-25',
  '* * * * *',
  $$
  SELECT pg_sleep(25);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :30 seconds
SELECT cron.schedule(
  'event-indexer-job-30',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :35 seconds
SELECT cron.schedule(
  'event-indexer-job-35',
  '* * * * *',
  $$
  SELECT pg_sleep(35);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :40 seconds
SELECT cron.schedule(
  'event-indexer-job-40',
  '* * * * *',
  $$
  SELECT pg_sleep(40);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :45 seconds
SELECT cron.schedule(
  'event-indexer-job-45',
  '* * * * *',
  $$
  SELECT pg_sleep(45);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :50 seconds
SELECT cron.schedule(
  'event-indexer-job-50',
  '* * * * *',
  $$
  SELECT pg_sleep(50);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job at :55 seconds
SELECT cron.schedule(
  'event-indexer-job-55',
  '* * * * *',
  $$
  SELECT pg_sleep(55);
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key'))
      ),
      body := '{}'::jsonb
    );
  $$
);
