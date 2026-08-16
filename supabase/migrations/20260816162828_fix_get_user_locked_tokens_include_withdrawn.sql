/*
# Fix get_user_locked_tokens to Include Withdrawn Locks

1. Problem
   - get_user_locked_tokens filtered is_withdrawn = false, so withdrawn locks
     never appeared in the MyLocks "withdrawn locks" section.
   - The frontend already has client-side filtering for active vs withdrawn locks,
     but the database function was hiding withdrawn locks before they reached the UI.

2. Changes
   - DROP and recreate get_user_locked_tokens to include all locks (withdrawn and non-withdrawn)
   - The frontend already splits locks into active and withdrawn sections

3. Security
   - No changes to RLS policies
   - Function remains SECURITY DEFINER, read-only, only shows user's own locks
*/

DROP FUNCTION IF EXISTS get_user_locked_tokens(text);

CREATE OR REPLACE FUNCTION get_user_locked_tokens(user_addr text)
RETURNS TABLE (
  id uuid,
  lock_id bigint,
  user_address text,
  token_address text,
  token_symbol text,
  token_name text,
  token_decimals integer,
  amount_locked numeric,
  amount_locked_formatted numeric,
  lock_duration_days integer,
  lock_timestamp timestamptz,
  unlock_timestamp timestamptz,
  is_withdrawn boolean,
  is_unlockable boolean,
  current_price_eth numeric,
  current_price_usd numeric,
  value_eth numeric,
  value_usd numeric,
  tx_hash text,
  withdraw_tx_hash text,
  chain_id integer
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tl.id,
    tl.lock_id,
    tl.user_address,
    tl.token_address,
    tl.token_symbol,
    tl.token_name,
    tl.token_decimals,
    tl.amount_locked,
    (tl.amount_locked / POWER(10, tl.token_decimals))::numeric as amount_locked_formatted,
    tl.lock_duration_days,
    tl.lock_timestamp,
    tl.unlock_timestamp,
    tl.is_withdrawn,
    (tl.unlock_timestamp <= NOW() AND tl.is_withdrawn = false) as is_unlockable,
    COALESCE(
      t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0),
      0
    ) as current_price_eth,
    COALESCE(
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    ) as current_price_usd,
    COALESCE(
      (tl.amount_locked / POWER(10, tl.token_decimals))::numeric *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)),
      0
    ) as value_eth,
    COALESCE(
      (tl.amount_locked / POWER(10, tl.token_decimals))::numeric *
      (t.current_eth_reserve::numeric / NULLIF(t.current_token_reserve::numeric, 0)) *
      (SELECT price_usd FROM eth_price_history ORDER BY timestamp DESC LIMIT 1),
      0
    ) as value_usd,
    tl.tx_hash,
    tl.withdraw_tx_hash,
    tl.chain_id
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address AND t.chain_id = tl.chain_id
  WHERE LOWER(tl.user_address) = LOWER(user_addr)
  ORDER BY tl.is_withdrawn ASC, tl.unlock_timestamp ASC, tl.created_at DESC;
END;
$$ LANGUAGE plpgsql;
