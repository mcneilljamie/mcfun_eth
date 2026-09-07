/*
# Batch price-change metadata for the token list

1. New Function
- `get_tokens_price_metadata(p_token_addresses text[])`
- Returns, for each requested token, the exact same price building blocks the
  single-token chart function (`get_price_chart_data_optimized`) already uses:
  - `token_created_at` — when the token launched.
  - `launch_price_usd` — the launch price valued in USD.
  - `last_price_usd` — the current price from live pool reserves and the latest ETH/USD price.
  - `price_24h_ago_usd` — the price roughly 24 hours ago (falls back to the oldest
    snapshot and finally the launch price when history is sparse).
  - `has_recent_trades` — whether the token traded within the last 24 hours.

2. Why
- The Popular Tokens list previously computed its percentage change from a different
  price source than the token detail page, so the same token could show two different
  percentages. This function lets the list read the SAME numbers the detail page uses,
  in a single batched call, so the percentage is identical everywhere.

3. Security
- SECURITY DEFINER with a fixed search_path, read-only (STABLE). Execute granted to
  anon and authenticated so the public frontend can call it.
*/

CREATE OR REPLACE FUNCTION get_tokens_price_metadata(p_token_addresses text[])
RETURNS TABLE (
  token_address text,
  token_created_at timestamptz,
  launch_price_usd numeric,
  last_price_usd numeric,
  price_24h_ago_usd numeric,
  has_recent_trades boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cur_eth AS (
    SELECT eph.price_usd
    FROM eth_price_history eph
    ORDER BY eph.timestamp DESC
    LIMIT 1
  )
  SELECT
    t.token_address,
    t.created_at AS token_created_at,
    COALESCE(
      t.launch_price_eth * COALESCE(
        (SELECT eph.price_usd FROM eth_price_history eph
         WHERE eph.timestamp <= t.created_at
         ORDER BY eph.timestamp DESC LIMIT 1),
        t.launch_eth_price_usd,
        (SELECT price_usd FROM cur_eth)
      ),
      0
    ) AS launch_price_usd,
    COALESCE(
      (t.current_eth_reserve / NULLIF(t.current_token_reserve, 0)) * (SELECT price_usd FROM cur_eth),
      0
    ) AS last_price_usd,
    COALESCE(
      (SELECT ps24.price_eth * COALESCE(
          (SELECT eph.price_usd FROM eth_price_history eph
           WHERE eph.timestamp <= ps24.created_at
           ORDER BY eph.timestamp DESC LIMIT 1),
          ps24.eth_price_usd)
       FROM price_snapshots ps24
       WHERE ps24.token_address = t.token_address
         AND ps24.created_at <= NOW() - INTERVAL '24 hours'
       ORDER BY ps24.created_at DESC
       LIMIT 1),
      (SELECT pso.price_eth * COALESCE(
          (SELECT eph.price_usd FROM eth_price_history eph
           WHERE eph.timestamp <= pso.created_at
           ORDER BY eph.timestamp DESC LIMIT 1),
          pso.eth_price_usd)
       FROM price_snapshots pso
       WHERE pso.token_address = t.token_address
       ORDER BY pso.created_at ASC
       LIMIT 1),
      t.launch_price_eth * COALESCE(
        (SELECT eph.price_usd FROM eth_price_history eph
         WHERE eph.timestamp <= t.created_at
         ORDER BY eph.timestamp DESC LIMIT 1),
        t.launch_eth_price_usd,
        (SELECT price_usd FROM cur_eth)),
      0
    ) AS price_24h_ago_usd,
    EXISTS (
      SELECT 1 FROM swaps s
      WHERE s.token_address = t.token_address
        AND s.created_at >= NOW() - INTERVAL '24 hours'
    ) AS has_recent_trades
  FROM tokens t
  WHERE t.token_address = ANY(p_token_addresses);
$function$;

GRANT EXECUTE ON FUNCTION get_tokens_price_metadata(text[]) TO anon, authenticated;
