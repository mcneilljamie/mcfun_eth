/*
  # Fix check_queue_lock_ready function column name

  1. Changes
    - Update check_queue_lock_ready function to use "acquired_at" instead of "locked_at"
    - This completes the fix for the lock system

  2. Notes
    - Both acquire_lock_with_queue and check_queue_lock_ready need to use the correct column name
*/

CREATE OR REPLACE FUNCTION public.check_queue_lock_ready(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  INSERT INTO indexer_locks (lock_key, acquired_at, expires_at)
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
$function$;
