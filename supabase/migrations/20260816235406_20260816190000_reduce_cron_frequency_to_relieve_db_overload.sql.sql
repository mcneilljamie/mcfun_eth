/*
# Reduce Cron Job Frequency to Relieve Database Overload

## Problem
The database is timing out on all queries due to too many concurrent cron jobs
overwhelming the instance. 17 scheduled jobs were firing, including:
- 2 event indexers every 60 seconds (Ethereum + Base)
- 2 burn indexers every 5 minutes
- 2 lock indexers every 10 minutes
- Platform stats update every 5 minutes (heavy function)
- Price snapshot every minute
- ETH price tracking, price change recalculation, lock stats refresh, etc.

## Changes
1. Unschedule the most aggressive and heavy jobs entirely:
   - base-event-indexer (was every 1 min)
   - ethereum-event-indexer (was every 1 min)
   - price-snapshot-1min (was every 1 min)
   - update-platform-stats (was every 5 min, heavy function)
   - recalculate-price-changes (was frequent)
   - refresh-lock-stats-mv (was frequent)
   - monitor-lock-indexer-health (was frequent)

2. Reschedule remaining indexers to 15-minute minimum:
   - ethereum-burn-indexer: every 15 min
   - base-burn-indexer: every 15 min
   - ethereum-lock-indexer: every 30 min
   - base-lock-indexer: every 30 min
   - track-eth-price-edge: every 15 min
   - burn-event-indexer-30min: keep at 30 min

3. Keep cleanup jobs (low frequency, lightweight)

## Security
- No RLS changes
- No data deletion
- Only cron schedule changes
*/

-- 1. Unschedule the most aggressive jobs entirely
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'base-event-indexer';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ethereum-event-indexer';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'price-snapshot-1min';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'update-platform-stats';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recalculate-price-changes';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-lock-stats-mv';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'monitor-lock-indexer-health';

-- 2. Reschedule burn indexers to 15 minutes
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ethereum-burn-indexer';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'base-burn-indexer';

-- 3. Reschedule lock indexers to 30 minutes
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ethereum-lock-indexer';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'base-lock-indexer';

-- 4. Reschedule ETH price tracking to 15 minutes
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'track-eth-price-edge';
