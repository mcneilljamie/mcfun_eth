/*
  # Create Individual Burn Events Table + Fix Platform Stats Market Cap

  1. New Table: `token_burn_events`
    - Tracks individual burn events with timestamps for per-burn chart accuracy
    - `id` (bigserial, primary key)
    - `token_address` (text) - Token being burned
    - `chain_id` (integer) - Chain the burn occurred on
    - `amount_burned` (numeric) - Tokens burned in this event (raw wei amount)
    - `cumulative_burned` (numeric) - Total burned up to and including this event
    - `percent_supply_burned` (numeric) - Cumulative percent of supply burned
    - `burn_timestamp` (timestamptz) - When the burn was detected
    - `burn_block` (bigint) - Block number of detection

  2. Modified: `update_platform_stats()` function
    - Now subtracts burned supply from market cap calculation
    - Uses `token_burn_totals.percent_supply_burned` to get circulating supply per token

  3. Security
    - RLS enabled on `token_burn_events`
    - Public read access (anon + authenticated)
    - Service role can insert
*/

CREATE TABLE IF NOT EXISTS token_burn_events (
  id bigserial PRIMARY KEY,
  token_address text NOT NULL,
  chain_id integer NOT NULL DEFAULT 1,
  amount_burned numeric NOT NULL DEFAULT 0,
  cumulative_burned numeric NOT NULL DEFAULT 0,
  percent_supply_burned numeric NOT NULL DEFAULT 0,
  burn_timestamp timestamptz NOT NULL DEFAULT now(),
  burn_block bigint NOT NULL DEFAULT 0
);

ALTER TABLE token_burn_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view burn events" ON token_burn_events;
CREATE POLICY "Anyone can view burn events"
  ON token_burn_events FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can insert burn events" ON token_burn_events;
CREATE POLICY "Service role can insert burn events"
  ON token_burn_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_burn_events_token_address ON token_burn_events(token_address);
CREATE INDEX IF NOT EXISTS idx_burn_events_timestamp ON token_burn_events(burn_timestamp);

-- Backfill existing burn data as single events
INSERT INTO token_burn_events (token_address, chain_id, amount_burned, cumulative_burned, percent_supply_burned, burn_timestamp, burn_block)
SELECT
  token_address,
  chain_id,
  total_amount_burned,
  total_amount_burned,
  percent_supply_burned,
  COALESCE(last_burn_timestamp, updated_at, now()),
  last_burn_block
FROM token_burn_totals
WHERE total_amount_burned > 0
ON CONFLICT DO NOTHING;

-- Update platform stats to account for burns in market cap
CREATE OR REPLACE FUNCTION update_platform_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_market_cap_usd numeric := 0;
  v_total_volume_eth numeric := 0;
  v_token_count integer := 0;
  v_eth_price_usd numeric := 3000;
  token_record RECORD;
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

  -- Loop through all tokens across all chains
  FOR token_record IN
    SELECT
      t.current_eth_reserve,
      t.initial_liquidity_eth,
      t.current_token_reserve,
      t.volume_eth,
      COALESCE(tbt.percent_supply_burned, 0) as burn_percent
    FROM tokens t
    LEFT JOIN token_burn_totals tbt ON tbt.token_address = t.token_address
  LOOP
    v_eth_reserve := COALESCE(token_record.current_eth_reserve, token_record.initial_liquidity_eth, 0);
    v_token_reserve := COALESCE(token_record.current_token_reserve, 1000000);

    IF v_token_reserve > 0 AND v_eth_reserve > 0 THEN
      v_price_eth := v_eth_reserve / v_token_reserve;
      v_burn_percent := COALESCE(token_record.burn_percent, 0);
      v_circulating_supply := 1000000 * (1 - v_burn_percent / 100);

      v_total_market_cap_usd := v_total_market_cap_usd + (v_price_eth * v_circulating_supply * v_eth_price_usd);
    END IF;

    v_total_volume_eth := v_total_volume_eth + COALESCE(token_record.volume_eth, 0);
    v_token_count := v_token_count + 1;
  END LOOP;

  -- Insert platform stats
  INSERT INTO platform_stats (
    total_market_cap_usd,
    total_volume_eth,
    token_count,
    created_at
  ) VALUES (
    v_total_market_cap_usd,
    v_total_volume_eth,
    v_token_count,
    NOW()
  );
END;
$$;
