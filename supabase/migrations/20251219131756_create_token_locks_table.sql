/*
  # Create Token Locks Table

  1. New Tables
    - `token_locks`
      - `id` (uuid, primary key)
      - `lock_id` (bigint, indexed) - The on-chain lock ID from the smart contract
      - `user_address` (text, indexed) - Address of the user who locked tokens
      - `token_address` (text, indexed) - Address of the locked ERC20 token
      - `token_symbol` (text) - Symbol of the locked token
      - `token_name` (text) - Name of the locked token
      - `token_decimals` (integer) - Decimals of the locked token
      - `amount_locked` (numeric) - Amount of tokens locked (in wei/smallest unit)
      - `lock_duration_days` (integer) - Duration of lock in days
      - `lock_timestamp` (timestamptz) - When the lock was created
      - `unlock_timestamp` (timestamptz) - When the lock can be unlocked
      - `is_withdrawn` (boolean, default false) - Whether tokens have been withdrawn
      - `tx_hash` (text) - Transaction hash of the lock
      - `block_number` (bigint) - Block number where lock occurred
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `token_locks` table
    - Add policy for public read access (anyone can view locked tokens)
    - Add policy for service role to insert/update (for event indexer)

  3. Indexes
    - Index on lock_id for quick lookups
    - Index on user_address for user-specific queries
    - Index on token_address for token-specific queries
    - Index on unlock_timestamp for filtering active/expired locks
    - Index on created_at for ordering
*/

CREATE TABLE IF NOT EXISTS token_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id bigint NOT NULL,
  user_address text NOT NULL,
  token_address text NOT NULL,
  token_symbol text NOT NULL,
  token_name text NOT NULL,
  token_decimals integer NOT NULL DEFAULT 18,
  amount_locked numeric NOT NULL,
  lock_duration_days integer NOT NULL,
  lock_timestamp timestamptz NOT NULL,
  unlock_timestamp timestamptz NOT NULL,
  is_withdrawn boolean DEFAULT false,
  tx_hash text NOT NULL,
  block_number bigint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_locks_lock_id ON token_locks(lock_id);
CREATE INDEX IF NOT EXISTS idx_token_locks_user ON token_locks(user_address);
CREATE INDEX IF NOT EXISTS idx_token_locks_token ON token_locks(token_address);
CREATE INDEX IF NOT EXISTS idx_token_locks_unlock_time ON token_locks(unlock_timestamp);
CREATE INDEX IF NOT EXISTS idx_token_locks_created ON token_locks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_locks_withdrawn ON token_locks(is_withdrawn);

ALTER TABLE token_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to token_locks"
  ON token_locks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated read access to token_locks"
  ON token_locks FOR SELECT
  TO authenticated
  USING (true);
