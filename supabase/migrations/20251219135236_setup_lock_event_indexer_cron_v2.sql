/*
  # Setup Lock Event Indexer Cron Job

  1. Purpose
    - Automatically index TokensLocked and TokensUnlocked events from the TokenLocker contract
    - Runs every 5 seconds to keep lock data up-to-date
    - Tracks which locks are active, withdrawn, and unlockable

  2. Cron Schedule
    - Runs every 5 seconds
    - Invokes the lock-event-indexer edge function

  3. Security
    - Only creates the cron job if it doesn't already exist
*/

-- Create cron job for lock event indexer (runs every 5 seconds)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'index-lock-events'
  ) THEN
    PERFORM cron.schedule(
      'index-lock-events',
      '*/5 * * * * *',
      $CRON$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/lock-event-indexer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key')
        )
      );
      $CRON$
    );
  END IF;
END $$;
