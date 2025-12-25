/*
  # Create Indexer Locks Table

  1. New Table
    - `indexer_locks` - Prevents concurrent indexer executions
    - Uses lock_key as unique constraint
    - Automatically cleans up expired locks

  2. Purpose
    - Prevents multiple indexer instances from running simultaneously
    - Avoids duplicate database writes
    - Ensures data consistency

  3. Security
    - Only service role can write to this table
    - Locks expire automatically after 2 minutes
*/

CREATE TABLE IF NOT EXISTS indexer_locks (
  lock_key text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL
);

-- Index for finding expired locks
CREATE INDEX IF NOT EXISTS idx_indexer_locks_expires 
  ON indexer_locks(expires_at);

-- Enable RLS
ALTER TABLE indexer_locks ENABLE ROW LEVEL SECURITY;

-- Only service role can manage locks
CREATE POLICY "Service role can manage indexer locks"
  ON indexer_locks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Function to clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_indexer_locks()
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM indexer_locks
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Cron job to periodically clean up expired locks (every 10 minutes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-locks'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-expired-locks',
      '*/10 * * * *',
      $CRON$
      SELECT cleanup_expired_indexer_locks();
      $CRON$
    );
  END IF;
END $$;
