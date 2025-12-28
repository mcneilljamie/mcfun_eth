/*
  # Add Lock Indexer Catchup Cron Job

  This migration creates a periodic catchup job for the lock event indexer to ensure no locks are ever missed.

  1. New Cron Job
    - Runs lock-event-indexer in catchup mode every 6 hours
    - Scans entire blockchain history to find any missed locks
    - Ensures database stays in sync with on-chain state

  2. Purpose
    - Catches any locks that were missed due to indexer downtime or rate limiting
    - Acts as a safety net to ensure data completeness
    - Runs independently of the regular lock indexer

  ## Notes
  - Regular indexer runs every 10 seconds for recent blocks (reorg protection)
  - Catchup indexer runs every 6 hours for full history scan
  - Both can run concurrently safely due to upsert logic
*/

-- Add catchup cron job that runs every 6 hours
SELECT cron.schedule(
  'lock-indexer-catchup',
  '0 */6 * * *', -- Every 6 hours at minute 0
  $$
  SELECT
    net.http_post(
      url := 'https://ymglqvhgkmexdvnxdpzs.supabase.co/functions/v1/lock-event-indexer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ2xxdmhna21leGR2bnhkcHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM0NTE0NzEsImV4cCI6MjA0OTAyNzQ3MX0.EeHHDh7pWm2gxTpf_HuEETW9aMMc39jU-K9YCKU5bAE'
      ),
      body := jsonb_build_object('catchup', true),
      timeout_milliseconds := 300000
    ) AS request_id;
  $$
);
