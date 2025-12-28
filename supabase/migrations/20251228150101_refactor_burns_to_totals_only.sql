/*
  # Refactor Burn Tracking to Store Only Aggregated Totals

  1. Changes
    - Drop old `token_burns` table (individual transactions)
    - Drop old burn aggregation functions
    - Create new `token_burn_totals` table (aggregated data only)
    - Create simple leaderboard function

  2. New Table: `token_burn_totals`
    - `token_address` (text, primary key) - Token being tracked
    - `total_amount_burned` (numeric) - Total tokens burned
    - `total_value_usd` (numeric) - Total value in USD at time of burns
    - `burn_count` (integer) - Number of burn transactions
    - `percent_supply_burned` (numeric) - Percentage of supply burned
    - `last_burn_timestamp` (timestamptz) - When last burn occurred
    - `last_burn_block` (bigint) - Last processed block number
    - `updated_at` (timestamptz) - Last update time

  3. Security
    - Enable RLS on `token_burn_totals`
    - Public read access for leaderboard
    - Service role can update totals

  4. Functions
    - `get_top_burned_tokens(limit)` - Returns leaderboard of most burned tokens
*/

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS get_top_burned_tokens();
DROP FUNCTION IF EXISTS get_user_burned_tokens(text);
DROP FUNCTION IF EXISTS get_token_burn_stats(text);

-- Drop old table
DROP TABLE IF EXISTS token_burns CASCADE;

-- Create new aggregated totals table
CREATE TABLE IF NOT EXISTS token_burn_totals (
  token_address text PRIMARY KEY,
  total_amount_burned numeric NOT NULL DEFAULT 0,
  total_value_usd numeric NOT NULL DEFAULT 0,
  burn_count integer NOT NULL DEFAULT 0,
  percent_supply_burned numeric NOT NULL DEFAULT 0,
  last_burn_timestamp timestamptz,
  last_burn_block bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE token_burn_totals ENABLE ROW LEVEL SECURITY;

-- Public read access for leaderboard
CREATE POLICY "Anyone can view burn totals"
  ON token_burn_totals FOR SELECT
  TO public
  USING (true);

-- Service role can update totals
CREATE POLICY "Service role can update burn totals"
  ON token_burn_totals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for sorting by amount
CREATE INDEX IF NOT EXISTS idx_token_burn_totals_amount ON token_burn_totals(total_amount_burned DESC);
CREATE INDEX IF NOT EXISTS idx_token_burn_totals_value ON token_burn_totals(total_value_usd DESC);

-- Function to get top burned tokens leaderboard
CREATE OR REPLACE FUNCTION get_top_burned_tokens(limit_count integer DEFAULT 10)
RETURNS TABLE (
  token_address text,
  token_name text,
  token_symbol text,
  total_amount_burned numeric,
  total_value_usd numeric,
  burn_count integer,
  percent_supply_burned numeric,
  last_burn_timestamp timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tbt.token_address,
    t.name as token_name,
    t.symbol as token_symbol,
    tbt.total_amount_burned,
    tbt.total_value_usd,
    tbt.burn_count,
    tbt.percent_supply_burned,
    tbt.last_burn_timestamp
  FROM token_burn_totals tbt
  LEFT JOIN tokens t ON t.token_address = tbt.token_address
  ORDER BY tbt.total_amount_burned DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
