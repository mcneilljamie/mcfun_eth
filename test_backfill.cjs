const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mulgpdxllortyotcdjqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk5MDIxMiwiZXhwIjoyMDgwNTY2MjEyfQ.ykzw3n35l-vE6r6-GZz8iY3Ui_hD9rL8JhSkIw7MmjE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillGaps() {
  console.log('Backfilling missing swaps for token 0x02352ccd8896861ab9c5039eda9c91a4d37dc587...\n');

  const gaps = [
    { from: 9859512, to: 9860511 },
    { from: 9924512, to: 9925136 }
  ];

  for (const gap of gaps) {
    console.log(`\nBackfilling blocks ${gap.from}-${gap.to}...`);

    try {
      const { data, error } = await supabase.functions.invoke('backfill-missing-swaps', {
        body: {
          token_address: '0x02352ccd8896861ab9c5039eda9c91a4d37dc587',
          from_block: gap.from,
          to_block: gap.to
        }
      });

      if (error) {
        console.error('Error:', error);
        continue;
      }

      console.log('Backfill Results:');
      console.log('=================');
      console.log(`Token: ${data.symbol} (${data.name})`);
      console.log(`Swaps found on-chain: ${data.swaps_found}`);
      console.log(`Swaps inserted to DB: ${data.swaps_inserted}`);
      console.log(`Volume added: ${data.volume_added_eth.toFixed(6)} ETH`);
      console.log(`Execution time: ${data.execution_time_ms}ms`);

      if (data.swaps_inserted > 0) {
        console.log('✓ Successfully recovered missing swaps!');
      } else {
        console.log('- No new swaps inserted (already in database)');
      }
    } catch (err) {
      console.error('Exception:', err.message);
    }
  }

  console.log('\n\n=== VERIFICATION ===');
  console.log('Running gap detection again to verify all swaps are now indexed...\n');

  try {
    const { data, error } = await supabase.functions.invoke('detect-indexer-gaps', {
      body: {
        token_address: '0x02352ccd8896861ab9c5039eda9c91a4d37dc587',
        block_range_size: 1000
      }
    });

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (data.tokens_with_gaps === 0) {
      console.log('✓ SUCCESS! All swaps are now indexed correctly.');
      console.log(`Total swaps recovered: ${data.total_missing_swaps === 0 ? 'All gaps filled' : 'Still missing: ' + data.total_missing_swaps}`);
    } else {
      console.log(`⚠️ Still ${data.total_missing_swaps} missing swaps in ${data.tokens_with_gaps} gap(s)`);
    }
  } catch (err) {
    console.error('Verification error:', err.message);
  }
}

backfillGaps();
