const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BUB_ADDRESS = "0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b";

async function testBurnLogic() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  console.log("=== Testing Burn Indexer Logic ===\n");

  // Step 1: Get on-chain balance
  const tokenContract = new ethers.Contract(
    BUB_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );

  const burnedBalance = await tokenContract.balanceOf(BURN_ADDRESS);
  console.log(`1. On-chain burned balance (BigInt): ${burnedBalance}`);
  console.log(`   Type: ${typeof burnedBalance}`);
  console.log(`   Value: ${burnedBalance.toString()}`);

  // Step 2: Get database value
  const { data: existingBurn } = await supabase
    .from("token_burn_totals")
    .select("total_amount_burned, burn_count, last_burn_timestamp")
    .eq("token_address", BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  console.log(`\n2. Database burned balance (before manual fix): ${existingBurn?.total_amount_burned}`);
  console.log(`   Type: ${typeof existingBurn?.total_amount_burned}`);

  // Step 3: Convert database value to BigInt (as the indexer does)
  const previousBurnedAmount = existingBurn?.total_amount_burned
    ? BigInt(existingBurn.total_amount_burned)
    : 0n;

  console.log(`\n3. Previous burned amount converted to BigInt: ${previousBurnedAmount}`);
  console.log(`   Type: ${typeof previousBurnedAmount}`);

  // Step 4: Test the comparison
  console.log(`\n4. Comparison test:`);
  console.log(`   burnedBalance <= previousBurnedAmount: ${burnedBalance <= previousBurnedAmount}`);
  console.log(`   burnedBalance > previousBurnedAmount: ${burnedBalance > previousBurnedAmount}`);
  console.log(`   burnedBalance == previousBurnedAmount: ${burnedBalance == previousBurnedAmount}`);

  // Step 5: Show what should happen
  if (burnedBalance <= previousBurnedAmount) {
    console.log(`\n5. Result: Indexer would SKIP (no burn detected)`);
  } else {
    console.log(`\n5. Result: Indexer would UPDATE (new burn detected)`);
    console.log(`   Difference: ${Number(burnedBalance - previousBurnedAmount) / 1e18} tokens`);
  }

  // Step 6: Check if the database was already updated by manual fix
  const { data: currentBurn } = await supabase
    .from("token_burn_totals")
    .select("total_amount_burned, updated_at")
    .eq("token_address", BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  console.log(`\n6. Current database state:`);
  console.log(`   Burned: ${Number(currentBurn?.total_amount_burned) / 1e18} tokens`);
  console.log(`   Last updated: ${currentBurn?.updated_at}`);
}

testBurnLogic().catch(console.error);
