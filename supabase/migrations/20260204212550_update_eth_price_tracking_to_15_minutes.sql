/*
  # Update ETH Price Tracking to 15-Minute Intervals

  ## Summary
  Updates the ETH price tracking cron job to run every 15 minutes instead of every minute.
  This reduces API calls while maintaining accurate price data for market cap calculations.

  ## Changes
  1. Removes the existing 1-minute cron job
  2. Creates a new cron job that runs every 15 minutes
  3. Maintains the same functionality with reduced frequency

  ## Impact
  - Reduces CoinGecko API calls from 1,440/day to 96/day
  - Still provides fresh price data within acceptable tolerance
  - Reduces database and edge function execution load
*/

-- Remove the existing 1-minute cron job
SELECT cron.unschedule('track-eth-price-1min');

-- Schedule ETH price tracking every 15 minutes
SELECT cron.schedule(
  'track-eth-price-15min',
  '*/15 * * * *',
  'SELECT track_eth_price()'
);