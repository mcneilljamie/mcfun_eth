require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

async function insertMissingSwaps() {
  try {
    // Transaction 1: Block 9925335 - Sell 199,999.99999999997089617 HS for ETH
    const tx1Hash = '0xc518b9f04c2a34867e11a1570760154c84ef77742b8b8851d3e74257e2f48ad7';
    const block1 = await provider.getBlock(9925335);

    // Transaction 2: Block 9932073 - Buy 47,355.393588589434969942 HS with 0.003 ETH (0.002988 after fee)
    const tx2Hash = '0x5ad7e28ce7cc3f784dada66c83482dcbeaf01a385a34f6c756d5dbac0567bd61';
    const block2 = await provider.getBlock(9932073);

    const tokenAddress = '0xc9c878331e4c5c51c13f1f079bba2393fb83f6c8';
    const ammAddress = '0x8b1ae0ec9f16fba1802c5b2a611818f409c7b9d0';
    const userAddress = '0x930faccd3def3221788aab2ffb93cec264848133';

    const swapsToInsert = [
      {
        token_address: tokenAddress,
        amm_address: ammAddress,
        user_address: userAddress,
        eth_in: '0',
        token_in: '199999.99999999997089617',
        eth_out: '0.015150886156',  // Total including fee
        token_out: '0',
        tx_hash: tx1Hash,
        created_at: new Date(block1.timestamp * 1000).toISOString(),
        block_number: block1.number,
        block_hash: block1.hash,
      },
      {
        token_address: tokenAddress,
        amm_address: ammAddress,
        user_address: userAddress,
        eth_in: '0.003',
        token_in: '0',
        eth_out: '0',
        token_out: '47355.393588589434969942',
        tx_hash: tx2Hash,
        created_at: new Date(block2.timestamp * 1000).toISOString(),
        block_number: block2.number,
        block_hash: block2.hash,
      }
    ];

    console.log('Inserting swaps:', JSON.stringify(swapsToInsert, null, 2));

    const { data, error, count } = await supabase
      .from('swaps')
      .upsert(swapsToInsert, { onConflict: 'tx_hash', count: 'exact' });

    if (error) {
      console.error('Error inserting swaps:', error);
      process.exit(1);
    }

    console.log(`Successfully inserted ${count} swaps`);

    // Now create price snapshots
    const AMM_ABI = [
      'function reserveToken() external view returns (uint256)',
      'function reserveETH() external view returns (uint256)',
    ];

    const amm = new ethers.Contract(ammAddress, AMM_ABI, provider);
    const [reserveETH, reserveToken] = await Promise.all([
      amm.reserveETH(),
      amm.reserveToken(),
    ]);

    const ethReserve = parseFloat(ethers.formatEther(reserveETH));
    const tokenReserve = parseFloat(ethers.formatEther(reserveToken));
    const priceEth = ethReserve / tokenReserve;

    // Get ETH price
    const { data: ethPriceData } = await supabase
      .from('eth_price_history')
      .select('price_usd')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const ethPriceUsd = ethPriceData?.price_usd || 3000;

    const snapshotsToInsert = swapsToInsert.map((swap) => ({
      token_address: swap.token_address,
      price_eth: priceEth.toString(),
      eth_reserve: ethReserve.toString(),
      token_reserve: tokenReserve.toString(),
      created_at: swap.created_at,
      eth_price_usd: ethPriceUsd,
      is_interpolated: false,
      block_number: swap.block_number,
    }));

    console.log('Inserting price snapshots:', JSON.stringify(snapshotsToInsert, null, 2));

    const { error: snapshotError } = await supabase
      .from('price_snapshots')
      .upsert(snapshotsToInsert, { onConflict: 'token_address,block_number' });

    if (snapshotError) {
      console.error('Error inserting snapshots:', snapshotError);
    } else {
      console.log('Successfully inserted price snapshots');
    }

    console.log('✅ Missing swaps successfully inserted!');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

insertMissingSwaps();
