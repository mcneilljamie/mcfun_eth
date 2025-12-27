const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mulgpdxllortyotcdjqj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDk5MDIxMiwiZXhwIjoyMDgwNTY2MjEyfQ.ykzw3n35l-vE6r6-GZz8iY3Ui_hD9rL8JhSkIw7MmjE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGapDetection() {
  console.log('Testing gap detection for token 0x02352ccd8896861ab9c5039eda9c91a4d37dc587...\n');

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

    console.log('Gap Detection Results:');
    console.log('=====================');
    console.log(`Tokens checked: ${data.tokens_checked}`);
    console.log(`Tokens with gaps: ${data.tokens_with_gaps}`);
    console.log(`Total missing swaps: ${data.total_missing_swaps}`);
    console.log(`Execution time: ${data.execution_time_ms}ms\n`);

    if (data.results && data.results.length > 0) {
      for (const result of data.results) {
        console.log(`\nToken: ${result.symbol} (${result.token_address})`);
        console.log(`Gaps found: ${result.gaps_found}`);
        console.log(`Missing swaps: ${result.missing_swaps}\n`);

        console.log('Gap details:');
        for (const gap of result.gaps) {
          console.log(`  Blocks ${gap.start_block}-${gap.end_block}:`);
          console.log(`    On-chain: ${gap.on_chain_swaps} swaps`);
          console.log(`    Database: ${gap.database_swaps} swaps`);
          console.log(`    Missing: ${gap.missing} swaps`);
        }
      }
    } else {
      console.log('No gaps found - all swaps are indexed correctly!');
    }
  } catch (err) {
    console.error('Exception:', err.message);
  }
}

testGapDetection();
