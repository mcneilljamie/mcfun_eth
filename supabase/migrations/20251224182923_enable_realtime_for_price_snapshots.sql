/*
  # Enable Realtime for Price Snapshots
  
  1. Changes
    - Enable realtime replication for price_snapshots table
    - This allows frontend clients to subscribe to new price data as it's created
    - Enables instant chart updates when new trades occur
  
  2. Benefits
    - Charts update in real-time without polling
    - Better user experience with instant feedback
    - Reduces unnecessary database queries
*/

ALTER PUBLICATION supabase_realtime ADD TABLE price_snapshots;
