/*
  # Enable Realtime for Tokens Table

  1. Problem
    - Tokens table has price_change_24h cached by trigger
    - Frontend subscribes to tokens table changes
    - But realtime publication is not enabled for tokens table
    - So frontend never receives updates when cache is updated

  2. Solution
    - Enable realtime publication for tokens table
    - This allows frontend to receive instant updates when trigger modifies cached values

  3. Benefits
    - 24h price changes update in real-time on Popular Tokens page
    - No need for polling or manual refresh
    - Seamless user experience with live price change updates
*/

-- Enable realtime for tokens table
ALTER PUBLICATION supabase_realtime ADD TABLE tokens;
