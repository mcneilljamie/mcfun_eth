/*
  # Create Platform Statistics Table

  1. New Table
    - `platform_stats`
      - `id` (uuid, primary key)
      - `total_market_cap_usd` (numeric) - Total FDV of all tokens in USD
      - `total_volume_eth` (numeric) - Cumulative trading volume across all tokens
      - `token_count` (integer) - Number of tokens on the platform
      - `created_at` (timestamptz) - When stats were recorded

  2. Purpose
    - Track platform-wide metrics over time
    - Show total market capitalization (sum of all token FDVs)
    - Display aggregated volume and token count
    - Enable historical platform growth analysis

  3. Security
    - Enable RLS
    - Public read access (stats are public information)
    - No write access from client (only edge functions write)

  4. Indexes
    - Index on created_at for efficient time-based queries
*/

-- Create platform_stats table
CREATE TABLE IF NOT EXISTS platform_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_market_cap_usd numeric NOT NULL DEFAULT 0,
  total_volume_eth numeric NOT NULL DEFAULT 0,
  token_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_platform_stats_created ON platform_stats(created_at DESC);

-- Enable RLS
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access to platform_stats"
  ON platform_stats FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to platform_stats"
  ON platform_stats FOR SELECT
  TO authenticated
  USING (true);