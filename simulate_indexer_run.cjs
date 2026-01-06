const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BUB_ADDRESS = "0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

async function simulateIndexerRun() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");

  // This simulates what the edge function does - it needs SERVICE_ROLE_KEY but we only have ANON_KEY locally
  // So we'll just test the logic without actually writing
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  console.log("=== Simulating Burn Indexer Run ===\n");

  // Step 1: Get on-chain balance (what the indexer does)
  const tokenContract = new ethers.Contract(
    BUB_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  const burnedBalance = await tokenContract.balanceOf(BURN_ADDRESS);
  console.log(`1. On-chain burned balance: ${Number(burnedBalance) / 1e18} tokens`);
  console.log(`   Raw value: ${burnedBalance.toString()}`);

  // Step 2: Get database value (what the indexer does)
  const { data: existingBurn } = await supabase
    .from("token_burn_totals")
    .select("total_amount_burned, burn_count, last_burn_timestamp")
    .eq("token_address", BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  console.log(`\n2. Database burned balance: ${Number(existingBurn?.total_amount_burned) / 1e18} tokens`);
  console.log(`   Raw value: ${existingBurn?.total_amount_burned}`);
  console.log(`   Type: ${typeof existingBurn?.total_amount_burned}`);

  // Step 3: Convert to BigInt (what the indexer does)
  const previousBurnedAmount = existingBurn?.total_amount_burned
    ? BigInt(existingBurn.total_amount_burned)
    : 0n;

  console.log(`\n3. Previous burned (as BigInt): ${previousBurnedAmount}`);

  // Step 4: Compare (what the indexer does on line 112)
  console.log(`\n4. Comparison:`);
  console.log(`   burnedBalance: ${burnedBalance} (${typeof burnedBalance})`);
  console.log(`   previousBurnedAmount: ${previousBurnedAmount} (${typeof previousBurnedAmount})`);
  console.log(`   burnedBalance <= previousBurnedAmount: ${burnedBalance <= previousBurnedAmount}`);

  // Step 5: Decision
  if (burnedBalance <= previousBurnedAmount) {
    console.log(`\n5. ❌ INDEXER WOULD SKIP - No new burns detected`);
    console.log(`   This is a BUG! On-chain has ${Number(burnedBalance - previousBurnedAmount) / 1e18} more tokens`);
    return false;
  } else {
    console.log(`\n5. ✅ INDEXER WOULD UPDATE - New burn detected!`);
    console.log(`   Difference: ${Number(burnedBalance - previousBurnedAmount) / 1e18} tokens`);

    // Show what would be updated
    const burnedAmountFloat = Number(burnedBalance) / 1e18;
    const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;
    console.log(`\n   Would update to:`);
    console.log(`   - Total burned: ${burnedAmountFloat} tokens`);
    console.log(`   - Percent burned: ${percentBurned.toFixed(4)}%`);
    console.log(`   - Burn count: ${(existingBurn?.burn_count || 0) + 1}`);
    return true;
  }
}

simulateIndexerRun().catch(console.error);
