/*
  # Update Lock Indexer Catchup to Use Force Reindex

  1. Changes
    - Update lock-indexer-catchup cron job to pass force=true parameter
    - This ensures all lock events are re-processed using UPSERT logic
    - Fixes the issue where missing locks were skipped

  2. Purpose
    - Catchup jobs will now re-process ALL lock events regardless of database state
    - Ensures complete synchronization between blockchain and database
    - Uses UPSERT to safely update existing records or insert missing ones

  3. Notes
    - Regular indexer still runs every 30 seconds for new blocks
    - Catchup indexer runs every 6 hours with force reindex enabled
    - Both use UPSERT now, so duplicate processing is safe
*/

-- Update the catchup cron job to use force reindex mode
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'lock-indexer-catchup'),
  schedule := '0 */6 * * *',
  command := $$
    SELECT
      net.http_post(
        url := 'https://ymglqvhgkmexdvnxdpzs.supabase.co/functions/v1/lock-event-indexer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ2xxdmhna21leGR2bnhkcHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM0NTE0NzEsImV4cCI6MjA0OTAyNzQ3MX0.EeHHDh7pWm2gxTpf_HuEETW9aMMc39jU-K9YCKU5bAE'
        ),
        body := jsonb_build_object('catchup', true, 'force', true),
        timeout_milliseconds := 300000
      ) AS request_id;
  $$
);

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Lock indexer catchup updated to use force reindex mode';
  RAISE NOTICE 'All lock events will be re-processed using UPSERT to fix missing locks';
END $$;