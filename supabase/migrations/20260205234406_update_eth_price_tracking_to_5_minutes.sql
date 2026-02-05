/*
  # Update ETH Price Tracking to 5-Minute Intervals

  ## Summary
  Updates the ETH price tracking cron job to run every 5 minutes instead of every 15 minutes.
  This provides more accurate real-time pricing while still maintaining reasonable API usage.

  ## Changes
  1. Removes the existing 15-minute cron job
  2. Creates a new cron job that runs every 5 minutes
  3. Maintains the same functionality with improved freshness

  ## Impact
  - Increases CoinGecko API calls from 96/day to 288/day (still well within limits)
  - Provides fresher price data with max 5-minute staleness
  - Improves user experience with more accurate USD valuations
*/

-- Remove the existing 15-minute cron job
SELECT cron.unschedule('track-eth-price-15min');

-- Schedule ETH price tracking every 5 minutes
SELECT cron.schedule(
  'track-eth-price-5min',
  '*/5 * * * *',
  'SELECT track_eth_price()'
);