/*
# Re-enable Platform Stats Update Cron

1. Problem
   - The `update-platform-stats` cron job was removed during the August 16
     database-overload fix (migration 20260817002838 rescheduled only event
     indexers, ETH price, lock, and burn indexers — platform stats was dropped).
   - As a result, `platform_stats` has not been updated since 2026-08-17.
     The About page shows a stale total market cap ($2,942) calculated with
     an old ETH price, while the liquidity figure on the same page is
     calculated live from current token reserves — so the two numbers
     disagree.

2. Fix
   - Re-schedule `update-platform-stats` at a conservative 5-minute interval
     (the same cadence it had originally). This calls the existing
     `update_platform_stats()` SECURITY DEFINER function, which recomputes
     market cap, burned value, locked value, volume, and token count from
     current token reserves + burn totals + lock totals + the latest ETH
     price from `eth_price_history`.
   - 5 minutes is safe: the function is a single INSERT reading ~7 rows
     from `tokens`, `token_burn_totals`, and `token_locks`. It is far
     cheaper than the event indexers (which make outbound RPC calls).

3. Idempotency
   - Unschedule any existing `update-platform-stats` job first so re-running
     this migration does not create duplicates.
*/

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'update-platform-stats';

SELECT cron.schedule(
  'update-platform-stats',
  '*/5 * * * *',
  $$
  SELECT update_platform_stats();
  $$
);
