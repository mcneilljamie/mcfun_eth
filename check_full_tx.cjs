const { ethers } = require('ethers');

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const TX_HASH = '0xee11df4d5a16e30be30654494106b10542c8fbe366fe8f3ff3a56a3319291557';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

async function checkTransaction() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  
  console.log('Transaction:', TX_HASH);
  console.log('Block:', receipt.blockNumber);
  console.log('From:', receipt.from);
  console.log('To:', receipt.to);
  console.log('Status:', receipt.status === 1 ? 'Success' : 'Failed');
  console.log('\nAll Logs:');
  
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`\nLog ${i}:`);
    console.log('  Address:', log.address);
    console.log('  Topics:', log.topics);
    console.log('  Data:', log.data);
    
    // Check if this is a Transfer event
    if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
      const from = '0x' + log.topics[1].slice(26);
      const to = '0x' + log.topics[2].slice(26);
      const amount = log.data;
      console.log('  -> Transfer Event');
      console.log('     From:', from);
      console.log('     To:', to);
      console.log('     Amount:', amount);
      
      if (to.toLowerCase() === BURN_ADDRESS.toLowerCase()) {
        console.log('     *** THIS IS A BURN ***');
      }
    }
  }
}

checkTransaction().catch(console.error);
