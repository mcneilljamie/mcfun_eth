const { ethers } = require('ethers');
require('dotenv').config();

async function findBurnEvents() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const BUB_ADDRESS = '0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b';
  const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

  const token = new ethers.Contract(BUB_ADDRESS, [
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ], provider);

  const currentBlock = await provider.getBlockNumber();
  console.log('Current block:', currentBlock);
  console.log('Searching for Transfer events to burn address...\n');

  // Search last 10000 blocks
  const fromBlock = currentBlock - 10000;

  const filter = token.filters.Transfer(null, BURN_ADDRESS);
  const events = await token.queryFilter(filter, fromBlock, currentBlock);

  console.log(`Found ${events.length} burn event(s):\n`);

  for (const event of events) {
    const block = await event.getBlock();
    const amount = Number(event.args.value) / 1e18;
    console.log(`Block ${event.blockNumber} (${new Date(block.timestamp * 1000).toISOString()})`);
    console.log(`  From: ${event.args.from}`);
    console.log(`  Amount: ${amount} tokens`);
    console.log(`  Tx: ${event.transactionHash}`);
    console.log();
  }
}

findBurnEvents().catch(console.error);
