/*
  # Fix lock function column name mismatch

  1. Changes
    - Update acquire_lock_with_queue function to use correct column name "acquired_at" instead of "locked_at"
    - This fixes the price-snapshot function failing to acquire locks

  2. Notes
    - The indexer_locks table uses "acquired_at" but the function was using "locked_at"
    - This mismatch was preventing the lock system from working correctly
*/

CREATE OR REPLACE FUNCTION public.acquire_lock_with_queue(p_lock_key text, p_timeout_seconds integer DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_request_id uuid;
  v_lock_acquired boolean;
  v_queue_position integer;
BEGIN
  -- Generate unique request ID
  v_request_id := gen_random_uuid();

  -- Try to acquire lock immediately
  INSERT INTO indexer_locks (lock_key, acquired_at, expires_at)
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
$function$;
