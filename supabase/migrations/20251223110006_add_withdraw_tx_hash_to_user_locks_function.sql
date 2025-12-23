/*
  # Add Withdrawal Transaction Hash to User Locks Function

  1. Changes
    - Add `withdraw_tx_hash` field to `get_user_locked_tokens` function return type
    - Returns the transaction hash of the withdrawal transaction for withdrawn locks
    - Allows MyLocks page to show the correct transaction link for withdrawn tokens

  2. Purpose
    - Enable users to view the withdrawal transaction, not just the lock transaction
    - Improves transparency and UX for withdrawn locks
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
  withdraw_tx_hash text
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
    tl.withdraw_tx_hash
  FROM token_locks tl
  LEFT JOIN tokens t ON t.token_address = tl.token_address
  WHERE LOWER(tl.user_address) = LOWER(user_addr)
  ORDER BY tl.created_at DESC;
END;
$$ LANGUAGE plpgsql;