/*
  # Add Manual Lock Trigger Function

  1. Purpose
    - Create a simple SQL function to trigger the lock indexer
    - Bypasses authentication issues by calling directly from database
    - Useful for debugging and manual syncing

  2. Function
    - `trigger_lock_indexer()` - Manually triggers the lock event indexer
    - Returns the HTTP request ID for tracking

  3. Usage
    - SELECT trigger_lock_indexer();
*/

CREATE OR REPLACE FUNCTION trigger_lock_indexer()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTAyMTIsImV4cCI6MjA4MDU2NjIxMn0.cBteUPMhC6agkEIpVHofQiRFRWpIaxMaPUp0PfKS2G4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;
  
  RETURN v_request_id;
END;
$$;