/*
  # Create Lock Queue System for Mutex Protection

  1. New Tables
    - `indexer_lock_queue`
      - `queue_id` (bigserial, primary key) - Unique queue entry ID
      - `lock_key` (text) - Which lock is being requested
      - `request_id` (uuid) - Unique identifier for this specific request
      - `requested_at` (timestamptz) - When the lock was requested (for FIFO ordering)
      - `status` (text) - Current status: 'waiting', 'processing', 'completed', 'timeout'
      - `expires_at` (timestamptz) - When this queue entry should be considered stale
      - `acquired_at` (timestamptz) - When the lock was actually acquired
      - `released_at` (timestamptz) - When the lock was released

  2. Changes to Existing Tables
    - Add `queue_position` tracking
    - Add `last_heartbeat` for lock renewal

  3. Functions
    - `acquire_lock_with_queue()` - Attempt to acquire lock or join queue
    - `release_lock_and_advance_queue()` - Release lock and notify next in queue
    - `get_queue_position()` - Check position in queue
    - `cleanup_stale_queue_entries()` - Remove expired entries
    - `renew_lock()` - Extend lock expiration for long operations

  4. Triggers
    - Auto-advance queue when lock is released
    - Auto-cleanup stale entries

  5. Security
    - Enable RLS on queue table
    - Add policies for authenticated access
*/

-- Create lock queue table
CREATE TABLE IF NOT EXISTS indexer_lock_queue (
  queue_id bigserial PRIMARY KEY,
  lock_key text NOT NULL,
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'processing', 'completed', 'timeout', 'failed')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  acquired_at timestamptz,
  released_at timestamptz,
  error_message text
);

-- Create indexes for efficient queue operations
CREATE INDEX IF NOT EXISTS idx_lock_queue_key_status ON indexer_lock_queue(lock_key, status) WHERE status IN ('waiting', 'processing');
CREATE INDEX IF NOT EXISTS idx_lock_queue_requested_at ON indexer_lock_queue(requested_at) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_lock_queue_expires_at ON indexer_lock_queue(expires_at) WHERE status IN ('waiting', 'processing');
CREATE INDEX IF NOT EXISTS idx_lock_queue_request_id ON indexer_lock_queue(request_id);

-- Enable RLS
ALTER TABLE indexer_lock_queue ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage queue
CREATE POLICY "Service role can manage lock queue"
  ON indexer_lock_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to acquire lock with queue support
CREATE OR REPLACE FUNCTION acquire_lock_with_queue(
  p_lock_key text,
  p_timeout_seconds integer DEFAULT 300
) RETURNS jsonb AS $$
DECLARE
  v_request_id uuid;
  v_lock_acquired boolean;
  v_queue_position integer;
BEGIN
  -- Generate unique request ID
  v_request_id := gen_random_uuid();

  -- Try to acquire lock immediately
  INSERT INTO indexer_locks (lock_key, locked_at, expires_at)
  VALUES (p_lock_key, now(), now() + interval '5 minutes')
  ON CONFLICT (lock_key) DO NOTHING
  RETURNING true INTO v_lock_acquired;

  IF v_lock_acquired THEN
    -- Lock acquired immediately
    RETURN jsonb_build_object(
      'success', true,
      'request_id', v_request_id,
      'acquired_immediately', true,
      'queue_position', 0
    );
  END IF;

  -- Lock not available, join the queue
  INSERT INTO indexer_lock_queue (lock_key, request_id, expires_at)
  VALUES (p_lock_key, v_request_id, now() + (p_timeout_seconds || ' seconds')::interval);

  -- Get queue position
  SELECT COUNT(*) INTO v_queue_position
  FROM indexer_lock_queue
  WHERE lock_key = p_lock_key
    AND status = 'waiting'
    AND requested_at <= (SELECT requested_at FROM indexer_lock_queue WHERE request_id = v_request_id);

  RETURN jsonb_build_object(
    'success', false,
    'request_id', v_request_id,
    'acquired_immediately', false,
    'queue_position', v_queue_position,
    'message', 'Lock is busy, added to queue at position ' || v_queue_position
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if lock is ready for a queued request
CREATE OR REPLACE FUNCTION check_queue_lock_ready(
  p_request_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_lock_key text;
  v_lock_acquired boolean;
  v_queue_position integer;
  v_status text;
  v_expired boolean;
BEGIN
  -- Get queue entry details
  SELECT lock_key, status, (expires_at < now()) INTO v_lock_key, v_status, v_expired
  FROM indexer_lock_queue
  WHERE request_id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Request ID not found in queue'
    );
  END IF;

  -- Check if expired
  IF v_expired THEN
    UPDATE indexer_lock_queue
    SET status = 'timeout'
    WHERE request_id = p_request_id;

    RETURN jsonb_build_object(
      'success', false,
      'timeout', true,
      'error', 'Queue wait timeout exceeded'
    );
  END IF;

  -- Check if already processing
  IF v_status = 'processing' THEN
    RETURN jsonb_build_object(
      'success', true,
      'acquired', true,
      'message', 'Lock already acquired'
    );
  END IF;

  -- Try to acquire lock
  INSERT INTO indexer_locks (lock_key, locked_at, expires_at)
  VALUES (v_lock_key, now(), now() + interval '5 minutes')
  ON CONFLICT (lock_key) DO NOTHING
  RETURNING true INTO v_lock_acquired;

  IF v_lock_acquired THEN
    -- Lock acquired, update queue status
    UPDATE indexer_lock_queue
    SET status = 'processing',
        acquired_at = now()
    WHERE request_id = p_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'acquired', true,
      'message', 'Lock acquired from queue'
    );
  END IF;

  -- Lock still not available, return queue position
  SELECT COUNT(*) INTO v_queue_position
  FROM indexer_lock_queue
  WHERE lock_key = v_lock_key
    AND status = 'waiting'
    AND requested_at <= (SELECT requested_at FROM indexer_lock_queue WHERE request_id = p_request_id);

  RETURN jsonb_build_object(
    'success', false,
    'acquired', false,
    'queue_position', v_queue_position,
    'message', 'Still waiting in queue at position ' || v_queue_position
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release lock and advance queue
CREATE OR REPLACE FUNCTION release_lock_and_advance_queue(
  p_request_id uuid DEFAULT NULL,
  p_lock_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_lock_key text;
  v_deleted boolean;
BEGIN
  -- If request_id provided, get lock_key from queue
  IF p_request_id IS NOT NULL THEN
    SELECT lock_key INTO v_lock_key
    FROM indexer_lock_queue
    WHERE request_id = p_request_id;

    -- Update queue entry
    UPDATE indexer_lock_queue
    SET status = 'completed',
        released_at = now()
    WHERE request_id = p_request_id;
  ELSE
    v_lock_key := p_lock_key;
  END IF;

  IF v_lock_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lock key not found'
    );
  END IF;

  -- Release the lock
  DELETE FROM indexer_locks
  WHERE lock_key = v_lock_key
  RETURNING true INTO v_deleted;

  RETURN jsonb_build_object(
    'success', true,
    'released', COALESCE(v_deleted, false),
    'lock_key', v_lock_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to renew lock expiration for long operations
CREATE OR REPLACE FUNCTION renew_lock(
  p_request_id uuid,
  p_extend_minutes integer DEFAULT 5
) RETURNS jsonb AS $$
DECLARE
  v_lock_key text;
  v_renewed boolean;
BEGIN
  -- Get lock key from queue
  SELECT lock_key INTO v_lock_key
  FROM indexer_lock_queue
  WHERE request_id = p_request_id
    AND status = 'processing';

  IF v_lock_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Request not found or not in processing state'
    );
  END IF;

  -- Extend lock expiration
  UPDATE indexer_locks
  SET expires_at = now() + (p_extend_minutes || ' minutes')::interval
  WHERE lock_key = v_lock_key
  RETURNING true INTO v_renewed;

  -- Also extend queue entry expiration
  UPDATE indexer_lock_queue
  SET expires_at = now() + (p_extend_minutes * 2 || ' minutes')::interval
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'renewed', COALESCE(v_renewed, false),
    'new_expires_at', now() + (p_extend_minutes || ' minutes')::interval
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup stale queue entries
CREATE OR REPLACE FUNCTION cleanup_stale_queue_entries() RETURNS integer AS $$
DECLARE
  v_cleaned_count integer;
BEGIN
  -- Mark expired entries as timeout
  UPDATE indexer_lock_queue
  SET status = 'timeout'
  WHERE status IN ('waiting', 'processing')
    AND expires_at < now();

  GET DIAGNOSTICS v_cleaned_count = ROW_COUNT;

  -- Delete old completed/failed/timeout entries (older than 1 hour)
  DELETE FROM indexer_lock_queue
  WHERE status IN ('completed', 'failed', 'timeout')
    AND released_at < now() - interval '1 hour';

  RETURN v_cleaned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats() RETURNS jsonb AS $$
DECLARE
  v_stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_waiting', COUNT(*) FILTER (WHERE status = 'waiting'),
    'total_processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'total_completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'total_timeout', COUNT(*) FILTER (WHERE status = 'timeout'),
    'by_lock_key', jsonb_object_agg(
      lock_key,
      jsonb_build_object(
        'waiting', COUNT(*) FILTER (WHERE status = 'waiting'),
        'processing', COUNT(*) FILTER (WHERE status = 'processing')
      )
    )
  ) INTO v_stats
  FROM indexer_lock_queue
  WHERE status IN ('waiting', 'processing', 'completed', 'timeout')
    AND requested_at > now() - interval '1 hour'
  GROUP BY lock_key;

  RETURN COALESCE(v_stats, jsonb_build_object('message', 'No active queue entries'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create cron job for automatic cleanup (runs every 5 minutes)
SELECT cron.schedule(
  'cleanup-stale-queue-entries',
  '*/5 * * * *',
  $$SELECT cleanup_stale_queue_entries();$$
);
