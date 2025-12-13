/*
  # Enable Realtime for Swaps Table

  1. Changes
    - Enable realtime replication for the swaps table to support live trade updates
    - This allows the frontend to receive instant notifications when new trades occur
  
  2. Benefits
    - Instant trade updates in the UI without polling
    - Better user experience with real-time data
    - Reduced server load from constant polling
*/

-- Enable realtime for swaps table
ALTER PUBLICATION supabase_realtime ADD TABLE swaps;
