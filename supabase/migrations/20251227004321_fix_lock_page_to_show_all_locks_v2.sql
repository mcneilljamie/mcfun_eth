/*
  # Fix Lock Page to Show All Locks

  1. Changes
    - Update `get_locks_by_token_address_paginated` to show ALL locks (active, unlockable, and withdrawn)
    - Users should see complete lock history for a token
    - The total count should also include all locks
    - Add withdraw_tx_hash to the return type

  2. Purpose
    - Fix issue where locks are not showing on token-specific lock page
    - Provide transparency by showing all locks including withdrawn ones
    - Users can see the full history and status of all locks

  3. Security
    - Function maintains SECURITY DEFINER for consistent access
*/

-- Drop and recreate get_locks_by_token_address_paginated to show ALL locks
DROP FUNCTION IF EXISTS get_locks_by_token_address_paginated(text, integer, integer);

CREATE OR REPLACE FUNCTION get_locks_by_token_address_paginated(
  token_addr text,
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked text,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  tx_hash text,
  withdraw_tx_hash text,
  value_eth numeric,
  value_usd numeric,
  current_price_eth numeric,
  current_price_usd numeric,
  total_count bigint
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH counted AS (
    SELECT COUNT(*) as total
    FROM token_locks tl
    WHERE LOWER(tl.token_address) = LOWER(token_addr)
  )
  SELECT
    tl.id,
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked::text,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    tl.tx_hash,
    tl.withdraw_tx_hash,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
      0
    )::numeric as value_eth,
    COALESCE(
      (tl.amount_locked::numeric / (10::numeric ^ tl.token_decimals)) *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as value_usd,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    )::numeric as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    )::numeric as current_price_usd,
    counted.total::bigint as total_count
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  CROSS JOIN counted
  WHERE LOWER(tl.token_address) = LOWER(token_addr)
  ORDER BY tl.lock_timestamp DESC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;