/*
  # Add Insert and Update Policies for Token Locks

  1. Changes
    - Add INSERT policy for service role to allow lock event indexer to insert new locks
    - Add UPDATE policy for service role to allow lock event indexer to mark locks as withdrawn
    - These policies enable the lock-event-indexer edge function to properly log all lock events

  2. Security
    - INSERT policy allows service role to insert any lock record
    - UPDATE policy allows service role to update any lock record
    - Public users can still only read lock data (existing SELECT policies)
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role to insert token_locks" ON token_locks;
DROP POLICY IF EXISTS "Allow service role to update token_locks" ON token_locks;

-- Allow service role to insert new token locks (for the event indexer)
CREATE POLICY "Allow service role to insert token_locks"
  ON token_locks FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow service role to update token locks (for marking as withdrawn)
CREATE POLICY "Allow service role to update token_locks"
  ON token_locks FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
