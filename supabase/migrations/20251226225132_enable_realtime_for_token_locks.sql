/*
  # Enable Real-time Updates for Token Locks

  1. Changes
    - Enable real-time publications for token_locks table
    - Allows frontend to receive instant updates when locks are withdrawn
    - Ensures UI reflects withdrawal status immediately after indexer updates

  2. Purpose
    - When lock-event-indexer marks a lock as withdrawn, the MyLocks page should update instantly
    - Provides seamless UX without requiring manual page refresh
    - Keeps UI in sync with blockchain state
*/

-- Enable realtime for token_locks table
ALTER PUBLICATION supabase_realtime ADD TABLE token_locks;
