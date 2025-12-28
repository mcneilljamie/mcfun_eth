/*
  # Setup Lock Withdrawal Sync Cron Job
  
  1. Purpose
    - Automatically sync lock withdrawal status from blockchain to database
    - Run every 30 seconds to keep UI in sync with on-chain state
    - Essential for My Locks page to show correct withdrawal status
  
  2. Cron Schedule
    - Runs every 30 seconds
    - Checks all non-withdrawn locks against blockchain
    - Updates database when withdrawals are detected
  
  3. Function Call
    - Calls sync-lock-withdrawals edge function
    - Uses service role for authentication
*/

-- Create cron job to sync lock withdrawals every 30 seconds
SELECT cron.schedule(
  'sync-lock-withdrawal-status-v1',
  '30 seconds',
  $$
  SELECT
    net.http_post(
      url:='https://jtyrrczlchszxmewpqrk.supabase.co/functions/v1/sync-lock-withdrawals',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body:=jsonb_build_object(),
      timeout_milliseconds:=25000
    );
  $$
);
