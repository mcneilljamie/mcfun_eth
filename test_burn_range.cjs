const { ethers } = require('ethers');
require('dotenv').config();

const CSD_TOKEN = '0x8e1a303ca81515e1cb3067d43f99cc91651f7208';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

async function testBurnRange() {
  const provider = new ethers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  );

  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);

  // Simulate what the indexer would do
  const lookback = 50000;
  const fromBlock = currentBlock - lookback;
  const maxRange = 2000;
  const toBlock = Math.min(fromBlock + maxRange, currentBlock);

  console.log('Indexer would query:');
  console.log('From block:', fromBlock);
  console.log('To block:', toBlock);
  console.log('Range:', toBlock - fromBlock);

  console.log('\nBurn transaction is at block: 9925587');
  console.log('Would be covered?', fromBlock <= 9925587 && 9925587 <= toBlock);

  // Try to query for burns
  const ERC20_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ];

  const tokenContract = new ethers.Contract(CSD_TOKEN, ERC20_ABI, provider);

  console.log('\n\nQuerying for burns from block 9925580 to 9925590...');
  const transferFilter = tokenContract.filters.Transfer(null, BURN_ADDRESS);
  const events = await tokenContract.queryFilter(transferFilter, 9925580, 9925590);

  console.log('Found', events.length, 'burn events');
  for (const event of events) {
    console.log('\nBurn event:');
    console.log('Block:', event.blockNumber);
    console.log('From:', event.args[0]);
    console.log('To:', event.args[1]);
    console.log('Amount:', event.args[2].toString());
    console.log('Tx hash:', event.transactionHash);
  }
}

testBurnRange().catch(console.error);
