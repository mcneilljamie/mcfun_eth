/*
  # Fix Platform Stats: Burn-Adjusted Market Cap + Restore Burned/Locked Totals

  1. Problem
    - Previous migration overwrote update_platform_stats() and lost the
      total_burned_usd and total_locked_usd calculations from later migrations.
    - The market cap was also still using full 1M supply without deducting burns.

  2. Fix
    - Rewrite update_platform_stats() to include ALL three calculations:
      a) Market cap using circulating supply (1M - burn%)
      b) Total burned USD value
      c) Total locked USD value
    - Use lower() on all token_address joins for case-insensitive matching.
*/

CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_market_cap_usd numeric := 0;
  v_total_volume_eth numeric := 0;
  v_total_burned_usd numeric := 0;
  v_total_locked_usd numeric := 0;
  v_token_count integer := 0;
  v_eth_price_usd numeric := 3000;
  token_record RECORD;
  burn_record RECORD;
  lock_record RECORD;
  v_price_eth numeric;
  v_eth_reserve numeric;
  v_token_reserve numeric;
  v_burn_percent numeric;
  v_circulating_supply numeric;
BEGIN
  -- Get current ETH price
  SELECT price_usd INTO v_eth_price_usd
  FROM eth_price_history
  ORDER BY timestamp DESC
  LIMIT 1;

  IF v_eth_price_usd IS NULL OR v_eth_price_usd = 0 THEN
    v_eth_price_usd := 3000;
  END IF;

  -- Calculate market cap from ALL tokens across ALL chains
  -- Now uses circulating supply (total supply minus burned percentage)
  FOR token_record IN
    SELECT
      t.token_address,
      t.chain_id,
      CAST(COALESCE(t.current_eth_reserve, t.initial_liquidity_eth) AS numeric) as eth_reserve,
      CAST(COALESCE(t.current_token_reserve, '1000000') AS numeric) as token_reserve,
      CAST(t.total_volume_eth AS numeric) as volume_eth,
      COALESCE(tbt.percent_supply_burned, 0) as burn_percent
    FROM tokens t
    LEFT JOIN token_burn_totals tbt ON lower(tbt.token_address) = lower(t.token_address)
  LOOP
    v_eth_reserve := token_record.eth_reserve;
    v_token_reserve := token_record.token_reserve;

    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;
      v_burn_percent := COALESCE(token_record.burn_percent, 0);
      v_circulating_supply := 1000000 * (1 - v_burn_percent / 100);
      v_total_market_cap_usd := v_total_market_cap_usd + (v_price_eth * v_circulating_supply * v_eth_price_usd);
    END IF;

    v_total_volume_eth := v_total_volume_eth + COALESCE(token_record.volume_eth, 0);
    v_token_count := v_token_count + 1;
  END LOOP;

  -- Calculate total burned value across all tokens
  FOR burn_record IN
    SELECT
      tbt.token_address,
      tbt.chain_id,
      tbt.total_amount_burned,
      t.current_eth_reserve,
      t.current_token_reserve
    FROM token_burn_totals tbt
    LEFT JOIN tokens t ON lower(t.token_address) = lower(tbt.token_address) AND t.chain_id = tbt.chain_id
    WHERE t.current_eth_reserve IS NOT NULL
      AND t.current_token_reserve IS NOT NULL
      AND t.current_token_reserve > 0
  LOOP
    v_eth_reserve := CAST(burn_record.current_eth_reserve AS numeric);
    v_token_reserve := CAST(burn_record.current_token_reserve AS numeric);

    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;
      v_total_burned_usd := v_total_burned_usd +
        ((burn_record.total_amount_burned / POWER(10, 18)::numeric) * v_price_eth * v_eth_price_usd);
    END IF;
  END LOOP;

  -- Calculate total locked value (non-withdrawn locks only)
  FOR lock_record IN
    SELECT
      tl.token_address,
      tl.chain_id,
      tl.amount_locked,
      tl.unlock_timestamp,
      t.current_eth_reserve,
      t.current_token_reserve,
      t.token_address as mcfun_token
    FROM token_locks tl
    LEFT JOIN tokens t ON lower(t.token_address) = lower(tl.token_address) AND t.chain_id = tl.chain_id
    WHERE tl.is_withdrawn = false
      AND tl.amount_locked > 0
  LOOP
    IF lock_record.mcfun_token IS NOT NULL AND lock_record.current_eth_reserve IS NOT NULL THEN
      v_eth_reserve := CAST(lock_record.current_eth_reserve AS numeric);
      v_token_reserve := CAST(lock_record.current_token_reserve AS numeric);

      IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
        v_price_eth := v_eth_reserve / v_token_reserve;
        v_total_locked_usd := v_total_locked_usd +
          ((lock_record.amount_locked / POWER(10, 18)::numeric) * v_price_eth * v_eth_price_usd);
      END IF;
    ELSE
      NULL;
    END IF;
  END LOOP;

  INSERT INTO platform_stats (
    total_market_cap_usd,
    total_volume_eth,
    total_burned_usd,
    total_locked_usd,
    token_count,
    created_at
  ) VALUES (
    v_total_market_cap_usd,
    v_total_volume_eth,
    v_total_burned_usd,
    v_total_locked_usd,
    v_token_count,
    NOW()
  );
END;
$$;
