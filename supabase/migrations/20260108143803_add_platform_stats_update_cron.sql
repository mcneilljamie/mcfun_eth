/*
  # Add Platform Stats Update Cron Job

  1. Changes
    - Add cron job to update platform statistics every 5 minutes
    - Calls the existing `update_platform_stats()` function
    - Ensures platform stats stay current without syncing reserves from blockchain
    - Uses direct SQL function call for efficiency

  2. Rationale
    - Platform stats were not being updated (last update was 4 days ago)
    - No existing cron job was calling the update function
    - Stats should update regularly to reflect current market cap and volume
*/

-- Add cron job to update platform stats every 5 minutes
SELECT cron.schedule(
  'update-platform-stats',
  '*/5 * * * *',
  $$
  SELECT update_platform_stats();
  $$
);
