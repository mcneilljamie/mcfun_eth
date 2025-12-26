/*
  # Add Unlock Status Function

  1. New Functions
    - `get_locks_with_status()` - Returns all locks with computed unlock status
    - `get_unlockable_locks_for_user()` - Returns unlockable locks for a user
    - Computes unlock status from database without blockchain calls

  2. Purpose
    - Reduce RPC calls by computing unlock status from timestamps
    - Cache unlock eligibility to avoid rate limiting
    - Frontend can check unlock status without hitting blockchain

  3. Security
    - Read-only functions
    - Based on immutable timestamps
    - Accessible to authenticated users
*/

-- Function to get all locks with computed unlock status
CREATE OR REPLACE FUNCTION get_locks_with_status(p_user_address text DEFAULT NULL)
RETURNS TABLE(
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  amount_locked text,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  is_unlockable boolean,
  tx_hash text,
  withdraw_tx_hash text,
  block_number bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.amount_locked,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    (tl.unlock_timestamp <= now() AND tl.is_withdrawn = false) as is_unlockable,
    tl.tx_hash,
    tl.withdraw_tx_hash,
    tl.block_number
  FROM token_locks tl
  WHERE p_user_address IS NULL OR tl.user_address = p_user_address
  ORDER BY tl.lock_timestamp DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get only unlockable locks for a user
CREATE OR REPLACE FUNCTION get_unlockable_locks_for_user(p_user_address text)
RETURNS TABLE(
  lock_id bigint,
  token_address text,
  token_symbol text,
  token_name text,
  amount_locked text,
  unlock_timestamp timestamptz,
  lock_duration_days integer,
  tx_hash text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.lock_id,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.amount_locked,
    tl.unlock_timestamp,
    tl.lock_duration_days,
    tl.tx_hash
  FROM token_locks tl
  WHERE tl.user_address = p_user_address
    AND tl.unlock_timestamp <= now()
    AND tl.is_withdrawn = false
  ORDER BY tl.unlock_timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Add index to speed up unlock status queries
CREATE INDEX IF NOT EXISTS idx_token_locks_unlock_status 
ON token_locks(user_address, unlock_timestamp, is_withdrawn)
WHERE is_withdrawn = false;

-- Add index for time-based queries
CREATE INDEX IF NOT EXISTS idx_token_locks_unlock_time
ON token_locks(unlock_timestamp, is_withdrawn)
WHERE is_withdrawn = false;
