require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bGdwZHhsbG9ydHlvdGNkanFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzQzNTYxNCwiZXhwIjoyMDQ5MDExNjE0fQ.sDnPOiOLi4VY_dJfZ8XFjnM3L5oPjuY8bfVKRo7A8e0'
);

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
  "function reserveToken() external view returns (uint256)",
  "function reserveETH() external view returns (uint256)"
];

async function indexTransaction() {
  const txHash = '0xd26cb06dd4dff14b750a24220345e253212c33de540a6841cff1666fda41324c';

  console.log('Fetching transaction...');
  const receipt = await provider.getTransactionReceipt(txHash);
  const block = await provider.getBlock(receipt.blockNumber);

  const ammAddress = '0x1a87379277736a10936e19bb5f7e3fa8dd968b53';
  const tokenAddress = '0x23fe52cb410c33dcdc5b15095399882e8d24d200';

  const amm = new ethers.Contract(ammAddress, AMM_ABI, provider);
  const iface = amm.interface;

  console.log('Parsing logs...');
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === ammAddress.toLowerCase()) {
      try {
        const parsed = iface.parseLog({topics: log.topics, data: log.data});
        if (parsed && parsed.name === 'Swap') {
          console.log('Found Swap event');

          const swapData = {
            token_address: tokenAddress,
            amm_address: ammAddress,
            user_address: parsed.args.user.toLowerCase(),
            eth_in: ethers.formatEther(parsed.args.ethIn),
            token_in: ethers.formatEther(parsed.args.tokenIn),
            eth_out: ethers.formatEther(parsed.args.ethOut),
            token_out: ethers.formatEther(parsed.args.tokenOut),
            tx_hash: txHash,
            created_at: new Date(block.timestamp * 1000).toISOString(),
            block_number: block.number,
            block_hash: block.hash,
          };

          console.log('Inserting swap:', swapData);

          const { data, error } = await supabase
            .from('swaps')
            .upsert(swapData, { onConflict: 'tx_hash' });

          if (error) {
            console.error('Error inserting swap:', error);
          } else {
            console.log('✓ Swap indexed successfully!');

            // Update reserves
            const [reserveETH, reserveToken] = await Promise.all([
              amm.reserveETH(),
              amm.reserveToken(),
            ]);

            await supabase
              .from('tokens')
              .update({
                current_eth_reserve: ethers.formatEther(reserveETH),
                current_token_reserve: ethers.formatEther(reserveToken),
              })
              .eq('amm_address', ammAddress);

            console.log('✓ Reserves updated');
          }
        }
      } catch (e) {
        // Not a Swap event, skip
      }
    }
  }
}

indexTransaction().catch(console.error);
