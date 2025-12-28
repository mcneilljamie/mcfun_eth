/*
  # Enable Realtime for Token Burn Totals

  1. Changes
    - Enable realtime updates for token_burn_totals table
    - Allows frontend to subscribe to burn updates in real-time
*/

-- Enable realtime for token_burn_totals
ALTER PUBLICATION supabase_realtime ADD TABLE token_burn_totals;
