/*
  # Fix Locked Tokens Function for Multi-Chain and External Tokens

  1. Changes
    - Add chain_id to return type and JOIN condition
    - Fix token price lookup to match by both token_address AND chain_id
    - Return chain_id so frontend can display which chain the lock is on
    - Prevent incorrect price lookups when same address exists on multiple chains

  2. Purpose
    - Support multi-chain locked token display
    - Correctly calculate values for tokens locked on different chains
    - Show $0.00 for external (non-McFun) tokens where price is not available

  3. Security
    - Maintains SECURITY DEFINER for consistent access
    - Only shows user's own locks
    - Read-only function
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
    AND tl.is_withdrawn = false
  ORDER BY tl.unlock_timestamp ASC, tl.created_at DESC;
END;
$$ LANGUAGE plpgsql;
