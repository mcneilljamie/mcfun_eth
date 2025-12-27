const { ethers } = require('ethers');
require('dotenv').config();

const BURN_TX_HASH = '0xbfb07866610f05b7d49381da9176afe53ce4be0db4a298dd7caf92cf825b98c7';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const CSD_TOKEN = '0x8e1a303ca81515e1cb3067d43f99cc91651f7208';

async function checkBurnTx() {
  const provider = new ethers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
  );

  console.log('Checking burn transaction:', BURN_TX_HASH);

  const tx = await provider.getTransaction(BURN_TX_HASH);
  if (!tx) {
    console.log('Transaction not found!');
    return;
  }

  console.log('\nTransaction details:');
  console.log('From:', tx.from);
  console.log('To:', tx.to);
  console.log('Block:', tx.blockNumber);

  const receipt = await provider.getTransactionReceipt(BURN_TX_HASH);
  if (!receipt) {
    console.log('Receipt not found!');
    return;
  }

  console.log('\nTransaction receipt:');
  console.log('Status:', receipt.status);
  console.log('Logs count:', receipt.logs.length);

  const ERC20_ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 value)'
  ];

  const iface = new ethers.Interface(ERC20_ABI);

  console.log('\nLogs:');
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({
        topics: log.topics,
        data: log.data
      });

      if (parsed && parsed.name === 'Transfer') {
        console.log('\nTransfer event found:');
        console.log('From:', parsed.args[0]);
        console.log('To:', parsed.args[1]);
        console.log('Amount:', parsed.args[2].toString());
        console.log('Token address:', log.address);
        console.log('Is burn to 0xdead?', parsed.args[1].toLowerCase() === BURN_ADDRESS.toLowerCase());
        console.log('Is CSD token?', log.address.toLowerCase() === CSD_TOKEN.toLowerCase());
      }
    } catch (e) {
      // Not a Transfer event
    }
  }
}

checkBurnTx().catch(console.error);
