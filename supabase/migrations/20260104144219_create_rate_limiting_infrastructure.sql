/*
  # Create Rate Limiting Infrastructure

  1. New Tables
    - `rate_limits`
      - `id` (bigint, primary key) - Auto-incrementing ID
      - `identifier` (text) - IP address or user identifier
      - `endpoint` (text) - Edge function name
      - `request_count` (integer) - Number of requests in current window
      - `window_start` (timestamptz) - Start of the current rate limit window
      - `created_at` (timestamptz) - When record was created
      - `updated_at` (timestamptz) - When record was last updated

  2. Indexes
    - Composite index on (identifier, endpoint, window_start) for fast lookups
    - Index on window_start for efficient cleanup

  3. Functions
    - `check_rate_limit(identifier text, endpoint text, max_requests int, window_seconds int)`
      Returns boolean indicating if request should be allowed
    - `cleanup_old_rate_limits()`
      Removes rate limit records older than 1 hour

  4. Security
    - Enable RLS on rate_limits table
    - Add policy for service role to manage rate limits
    - Regular users cannot read or modify rate limits

  5. Notes
    - Uses sliding window algorithm for accurate rate limiting
    - Automatically cleans up old records to prevent table bloat
    - Service role only access ensures security
*/

-- Create rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id bigserial PRIMARY KEY,
  identifier text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(identifier, endpoint, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON rate_limits(window_start);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limits (no public access)
CREATE POLICY "Service role can manage rate limits"
  ON rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check if a request should be rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_max_requests int DEFAULT 10,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
  v_window_start timestamptz;
  v_cutoff_time timestamptz;
BEGIN
  -- Calculate the cutoff time for the sliding window
  v_cutoff_time := now() - (p_window_seconds || ' seconds')::interval;

  -- Try to get existing rate limit record within the window
  SELECT request_count, window_start INTO v_current_count, v_window_start
  FROM rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start > v_cutoff_time
  ORDER BY window_start DESC
  LIMIT 1
  FOR UPDATE;

  -- If no recent record exists, create a new one
  IF NOT FOUND THEN
    INSERT INTO rate_limits (identifier, endpoint, request_count, window_start)
    VALUES (p_identifier, p_endpoint, 1, now());
    RETURN true; -- Allow the request
  END IF;

  -- If we're within the limit, increment and allow
  IF v_current_count < p_max_requests THEN
    UPDATE rate_limits
    SET request_count = request_count + 1,
        updated_at = now()
    WHERE identifier = p_identifier
      AND endpoint = p_endpoint
      AND window_start = v_window_start;
    RETURN true; -- Allow the request
  END IF;

  -- We've exceeded the rate limit
  RETURN false; -- Deny the request
END;
$$;

-- Function to clean up old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  -- Delete records older than 1 hour
  DELETE FROM rate_limits
  WHERE window_start < now() - interval '1 hour';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

-- Create a cron job to clean up old rate limits every 10 minutes
SELECT cron.schedule(
  'cleanup-rate-limits',
  '*/10 * * * *', -- Every 10 minutes
  $$SELECT cleanup_old_rate_limits();$$
);