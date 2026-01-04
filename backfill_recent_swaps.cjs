require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
];

async function backfillSwaps() {
  const ammAddress = '0x1a87379277736a10936e19bb5f7e3fa8dd968b53';
  const tokenAddress = '0x23fe52cb410c33dcdc5b15095399882e8d24d200';

  const { data: token } = await supabase
    .from('tokens')
    .select('last_checked_block')
    .eq('amm_address', ammAddress)
    .single();

  const startBlock = token.last_checked_block + 1;
  const endBlock = 9979500;

  console.log(`Backfilling swaps from block ${startBlock} to ${endBlock}...`);

  const amm = new ethers.Contract(ammAddress, AMM_ABI, provider);
  const filter = amm.filters.Swap();

  const events = await amm.queryFilter(filter, startBlock, endBlock);
  console.log(`Found ${events.length} swap events`);

  const swapsToInsert = [];

  for (const event of events) {
    const args = event.args;
    const block = await provider.getBlock(event.blockNumber);

    swapsToInsert.push({
      token_address: tokenAddress,
      amm_address: ammAddress,
      user_address: args.user.toLowerCase(),
      eth_in: ethers.formatEther(args.ethIn),
      token_in: ethers.formatEther(args.tokenIn),
      eth_out: ethers.formatEther(args.ethOut),
      token_out: ethers.formatEther(args.tokenOut),
      tx_hash: event.transactionHash,
      created_at: new Date(block.timestamp * 1000).toISOString(),
      block_number: block.number,
      block_hash: block.hash,
    });
  }

  if (swapsToInsert.length > 0) {
    const { data, error } = await supabase
      .from('swaps')
      .upsert(swapsToInsert, { onConflict: 'tx_hash' });

    if (error) {
      console.error('Error inserting swaps:', error);
    } else {
      console.log(`Successfully inserted ${swapsToInsert.length} swaps`);

      const [reserveETH, reserveToken] = await Promise.all([
        amm.reserveETH(),
        amm.reserveToken(),
      ]);

      await supabase
        .from('tokens')
        .update({
          current_eth_reserve: ethers.formatEther(reserveETH),
          current_token_reserve: ethers.formatEther(reserveToken),
          last_checked_block: endBlock,
        })
        .eq('amm_address', ammAddress);

      console.log('Updated token reserves');
    }
  }
}

backfillSwaps().catch(console.error);
