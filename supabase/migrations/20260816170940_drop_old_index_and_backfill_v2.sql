/*
# Drop old unique index and backfill snapshots from swaps
*/

DROP INDEX IF EXISTS idx_price_snapshots_token_block;

CREATE OR REPLACE FUNCTION backfill_price_snapshots_from_swaps()
RETURNS TABLE (
  p_token_address text,
  p_chain_id bigint,
  p_snapshots_created integer,
  p_snapshots_skipped integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_swap RECORD;
  v_eth_reserve NUMERIC;
  v_token_reserve NUMERIC;
  v_post_eth NUMERIC;
  v_post_token NUMERIC;
  v_price_eth NUMERIC;
  v_eth_price_usd NUMERIC;
  v_created_total INTEGER;
  v_skipped_total INTEGER;
  v_inserted INTEGER;
  v_initial_token_reserve NUMERIC;
  v_trade_direction TEXT;
BEGIN
  FOR v_token IN
    SELECT DISTINCT ON (s.token_address, s.chain_id)
      s.token_address AS tok_addr,
      s.chain_id AS tok_chain,
      t.initial_liquidity_eth,
      t.launch_price_eth,
      t.launch_eth_price_usd,
      t.liquidity_percent
    FROM swaps s
    JOIN tokens t ON t.token_address = s.token_address AND t.chain_id = s.chain_id
    ORDER BY s.token_address, s.chain_id
  LOOP
    v_eth_reserve := CAST(v_token.initial_liquidity_eth AS NUMERIC);
    v_initial_token_reserve := 1000000.0 * v_token.liquidity_percent / 100.0;
    v_token_reserve := v_initial_token_reserve;
    v_created_total := 0;
    v_skipped_total := 0;

    FOR v_swap IN
      SELECT
        s.tx_hash, s.transaction_index, s.log_index,
        s.block_number, s.created_at,
        s.eth_in, s.token_in, s.eth_out, s.token_out
      FROM swaps s
      WHERE s.token_address = v_token.tok_addr
        AND s.chain_id = v_token.tok_chain
      ORDER BY s.block_number ASC, s.transaction_index ASC NULLS LAST, s.log_index ASC NULLS LAST
    LOOP
      v_post_eth := v_eth_reserve + CAST(COALESCE(v_swap.eth_in, 0) AS NUMERIC) - CAST(COALESCE(v_swap.eth_out, 0) AS NUMERIC);
      v_post_token := v_token_reserve + CAST(COALESCE(v_swap.token_in, 0) AS NUMERIC) - CAST(COALESCE(v_swap.token_out, 0) AS NUMERIC);
      v_eth_reserve := v_post_eth;
      v_token_reserve := v_post_token;

      IF v_post_token > 0 THEN
        v_price_eth := v_post_eth / v_post_token;
      ELSE
        v_price_eth := 0;
      END IF;

      SELECT price_usd INTO v_eth_price_usd
      FROM eth_price_history
      WHERE timestamp <= v_swap.created_at
      ORDER BY timestamp DESC LIMIT 1;

      IF v_eth_price_usd IS NULL THEN
        v_eth_price_usd := CAST(v_token.launch_eth_price_usd AS NUMERIC);
      END IF;

      IF CAST(COALESCE(v_swap.eth_in, 0) AS NUMERIC) > 0 THEN
        v_trade_direction := 'BUY';
      ELSE
        v_trade_direction := 'SELL';
      END IF;

      INSERT INTO price_snapshots (
        token_address, price_eth, eth_reserve, token_reserve,
        eth_price_usd, is_interpolated, block_number, created_at,
        chain_id, transaction_hash, transaction_index, log_index,
        block_timestamp, trade_direction, eth_amount, token_amount,
        post_trade_eth_reserve, post_trade_token_reserve,
        market_cap_usd, is_reconstructed
      ) VALUES (
        v_token.tok_addr, v_price_eth, v_post_eth, v_post_token,
        v_eth_price_usd, false, v_swap.block_number, v_swap.created_at,
        v_token.tok_chain, v_swap.tx_hash, v_swap.transaction_index, v_swap.log_index,
        v_swap.created_at, v_trade_direction,
        CASE WHEN CAST(COALESCE(v_swap.eth_in, 0) AS NUMERIC) > 0 THEN v_swap.eth_in ELSE v_swap.eth_out END,
        CASE WHEN CAST(COALESCE(v_swap.token_in, 0) AS NUMERIC) > 0 THEN v_swap.token_in ELSE v_swap.token_out END,
        v_post_eth, v_post_token,
        v_price_eth * v_eth_price_usd * 1000000, true
      )
      ON CONFLICT ON CONSTRAINT price_snapshots_chain_tx_log_unique DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        v_created_total := v_created_total + 1;
      ELSE
        v_skipped_total := v_skipped_total + 1;
      END IF;
    END LOOP;

    UPDATE tokens
    SET current_eth_reserve = v_eth_reserve,
        current_token_reserve = v_token_reserve
    WHERE token_address = v_token.tok_addr AND chain_id = v_token.tok_chain;

    RETURN QUERY SELECT v_token.tok_addr, v_token.tok_chain, v_created_total, v_skipped_total;
  END LOOP;
END;
$$;

SELECT * FROM backfill_price_snapshots_from_swaps();
