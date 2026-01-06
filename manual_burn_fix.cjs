const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BUB_ADDRESS = "0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  console.log(`\nChecking BUB burns...`);

  const token = new ethers.Contract(BUB_ADDRESS, ERC20_ABI, provider);
  const [name, symbol, burnedBalance] = await Promise.all([
    token.name(),
    token.symbol(),
    token.balanceOf(BURN_ADDRESS)
  ]);

  console.log(`Token: ${name} (${symbol})`);
  console.log(`On-chain burned balance (raw): ${burnedBalance.toString()}`);
  console.log(`On-chain burned balance: ${Number(burnedBalance) / 1e18} tokens`);

  // Check database
  const { data: dbBurn, error } = await supabase
    .from("token_burn_totals")
    .select("*")
    .eq("token_address", BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error("Error fetching DB data:", error);
    return;
  }

  if (dbBurn) {
    console.log(`\nDatabase burned balance (raw): ${dbBurn.total_amount_burned}`);
    console.log(`Database burned balance: ${Number(dbBurn.total_amount_burned) / 1e18} tokens`);
    console.log(`Database last updated: ${dbBurn.updated_at}`);
    console.log(`Burn count: ${dbBurn.burn_count}`);
  } else {
    console.log("\nNo burn record in database");
  }

  // Compare
  const onChainBurned = BigInt(burnedBalance.toString());
  const dbBurned = dbBurn ? BigInt(dbBurn.total_amount_burned) : 0n;

  console.log(`\n--- Comparison ---`);
  console.log(`Difference: ${Number(onChainBurned - dbBurned) / 1e18} tokens`);

  if (onChainBurned > dbBurned) {
    console.log(`\n⚠️  Database is OUT OF SYNC!`);
    console.log(`On-chain has ${Number(onChainBurned - dbBurned) / 1e18} more tokens burned`);

    // Get token price for USD calculation
    const { data: tokenData } = await supabase
      .from("tokens")
      .select("current_eth_reserve, current_token_reserve")
      .eq("token_address", BUB_ADDRESS.toLowerCase())
      .maybeSingle();

    const { data: ethPrice } = await supabase
      .from("eth_price_history")
      .select("price_usd")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenData && tokenData.current_token_reserve && parseFloat(tokenData.current_token_reserve) > 0) {
      const tokenPriceEth = parseFloat(tokenData.current_eth_reserve) / parseFloat(tokenData.current_token_reserve);
      const ethPriceUsd = ethPrice?.price_usd || 3000;
      const burnedAmountFloat = Number(burnedBalance) / 1e18;
      const totalValueUsd = burnedAmountFloat * tokenPriceEth * ethPriceUsd;
      const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;

      console.log(`\n--- Calculated Values ---`);
      console.log(`Token price: ${tokenPriceEth} ETH`);
      console.log(`ETH price: $${ethPriceUsd}`);
      console.log(`Total value burned: $${totalValueUsd.toFixed(2)}`);
      console.log(`Percent burned: ${percentBurned.toFixed(4)}%`);

      console.log(`\n--- Updating database ---`);
      const { error: updateError } = await supabase
        .from("token_burn_totals")
        .upsert({
          token_address: BUB_ADDRESS.toLowerCase(),
          total_amount_burned: burnedBalance.toString(),
          total_value_usd: totalValueUsd.toString(),
          burn_count: (dbBurn?.burn_count || 0) + 1,
          percent_supply_burned: percentBurned.toString(),
          last_burn_timestamp: new Date().toISOString(),
          last_burn_block: await provider.getBlockNumber(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "token_address",
        });

      if (updateError) {
        console.error("Error updating:", updateError);
      } else {
        console.log("✅ Database updated successfully!");
      }
    }
  } else {
    console.log(`\n✅ Database is in sync`);
  }
}

main().catch(console.error);
