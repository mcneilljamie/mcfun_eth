const { ethers } = require('ethers');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BUB_ADDRESS = "0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b";
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const rpcUrl = process.env.ETHEREUM_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log(`\nFetching BUB burn data...`);

  const token = new ethers.Contract(BUB_ADDRESS, ERC20_ABI, provider);
  const burnedBalance = await token.balanceOf(BURN_ADDRESS);
  const currentBlock = await provider.getBlockNumber();

  console.log(`Burned Balance: ${ethers.formatEther(burnedBalance)} tokens`);
  console.log(`Current Block: ${currentBlock}`);

  // Get token price data
  const { data: tokenData } = await supabase
    .from('tokens')
    .select('current_eth_reserve, current_token_reserve')
    .eq('token_address', BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  if (!tokenData || !tokenData.current_token_reserve || parseFloat(tokenData.current_token_reserve) === 0) {
    console.error('No valid reserve data found for BUB');
    return;
  }

  const { data: ethPrice } = await supabase
    .from('eth_price_history')
    .select('price_usd')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  const tokenPriceEth = parseFloat(tokenData.current_eth_reserve) / parseFloat(tokenData.current_token_reserve);
  const ethPriceUsd = ethPrice?.price_usd || 3000;

  const burnedAmount = burnedBalance.toString();
  const burnedAmountFloat = Number(burnedBalance) / 1e18;
  const totalValueUsd = burnedAmountFloat * tokenPriceEth * ethPriceUsd;
  const percentBurned = (Number(burnedBalance) / Number(TOKEN_SUPPLY)) * 100;

  console.log(`\nCalculated Values:`);
  console.log(`Token Price (ETH): ${tokenPriceEth.toFixed(10)}`);
  console.log(`ETH Price (USD): $${ethPriceUsd}`);
  console.log(`Total Value (USD): $${totalValueUsd.toFixed(2)}`);
  console.log(`Percent Burned: ${percentBurned.toFixed(4)}%`);

  // Insert into database
  const { error: upsertError } = await supabase
    .from('token_burn_totals')
    .upsert({
      token_address: BUB_ADDRESS.toLowerCase(),
      total_amount_burned: burnedAmount,
      total_value_usd: totalValueUsd.toString(),
      burn_count: 1,
      percent_supply_burned: percentBurned.toString(),
      last_burn_timestamp: new Date().toISOString(),
      last_burn_block: currentBlock,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'token_address',
    });

  if (upsertError) {
    console.error('\n❌ Failed to insert burn data:', upsertError);
  } else {
    console.log('\n✅ Successfully inserted burn data for BUB');
  }

  // Verify the insertion
  const { data: verifyData } = await supabase
    .from('token_burn_totals')
    .select('*')
    .eq('token_address', BUB_ADDRESS.toLowerCase())
    .maybeSingle();

  console.log('\nVerification:', verifyData);
}

main().catch(console.error);
