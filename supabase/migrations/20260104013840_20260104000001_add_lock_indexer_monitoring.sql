/*
  # Add Lock Indexer Monitoring and Health Checks

  1. New Functions
    - `check_lock_indexer_health()` - Returns health status and metrics
    - Monitors indexer lag, activity, and potential issues

  2. Health Monitoring
    - CRITICAL: Indexer hasn't run in 30+ minutes
    - WARNING: Indexer is 1000+ blocks behind or 15+ minutes since last run
    - HEALTHY: Everything running smoothly

  3. Scheduled Monitoring
    - Health check runs every 5 minutes
    - Notifies on critical issues via pg_notify
*/

CREATE OR REPLACE FUNCTION check_lock_indexer_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state record;
  v_current_block bigint;
  v_blocks_behind bigint;
  v_minutes_since_run integer;
  v_health_status text;
  v_warnings text[];
BEGIN
  -- Get indexer state
  SELECT * INTO v_state
  FROM lock_indexer_state
  WHERE indexer_name = 'lock_indexer';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'ERROR',
      'warnings', ARRAY['Lock indexer state not found in database']
    );
  END IF;
  
  -- Estimate current block (Sepolia: ~12 sec blocks)
  v_current_block := v_state.last_indexed_block + 
    EXTRACT(EPOCH FROM (NOW() - v_state.last_indexed_at::timestamptz))::bigint / 12;
  
  v_blocks_behind := v_current_block - v_state.last_indexed_block;
  v_minutes_since_run := EXTRACT(EPOCH FROM (NOW() - v_state.last_indexed_at::timestamptz))::integer / 60;
  
  v_warnings := ARRAY[]::text[];
  
  -- Check health status
  IF v_minutes_since_run > 30 THEN
    v_health_status := 'CRITICAL';
    v_warnings := array_append(v_warnings, format('Indexer has not run in %s minutes', v_minutes_since_run));
  ELSIF v_blocks_behind > 1000 THEN
    v_health_status := 'WARNING';
    v_warnings := array_append(v_warnings, format('Indexer is %s blocks behind', v_blocks_behind));
  ELSIF v_minutes_since_run > 15 THEN
    v_health_status := 'WARNING';
    v_warnings := array_append(v_warnings, format('Indexer has not run in %s minutes', v_minutes_since_run));
  ELSE
    v_health_status := 'HEALTHY';
  END IF;
  
  IF v_state.is_active AND v_minutes_since_run > 10 THEN
    v_warnings := array_append(v_warnings, 'Indexer appears stuck with is_active=true for over 10 minutes');
  END IF;
  
  RETURN jsonb_build_object(
    'status', v_health_status,
    'last_indexed_block', v_state.last_indexed_block,
    'estimated_current_block', v_current_block,
    'blocks_behind', v_blocks_behind,
    'minutes_since_last_run', v_minutes_since_run,
    'is_active', v_state.is_active,
    'last_run', v_state.last_indexed_at,
    'warnings', v_warnings,
    'metadata', v_state.metadata
  );
END;
$$;

-- Schedule health check monitoring (every 5 minutes)
DO $$
DECLARE
  v_command text;
BEGIN
  -- Remove existing monitoring job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-lock-indexer-health') THEN
    PERFORM cron.unschedule('monitor-lock-indexer-health');
  END IF;

  v_command := 'SELECT CASE WHEN (check_lock_indexer_health()->>''status'') = ''CRITICAL'' THEN pg_notify(''lock_indexer_critical'', check_lock_indexer_health()::text) END';

  -- Create new monitoring job
  PERFORM cron.schedule(
    'monitor-lock-indexer-health',
    '*/5 * * * *',
    v_command
  );
  RAISE NOTICE 'Created monitor-lock-indexer-health job to run every 5 minutes';
END $$;
