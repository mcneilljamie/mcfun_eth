const { ethers } = require('ethers');

async function checkTx() {
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

  const txHash = '0xd26cb06dd4dff14b750a24220345e253212c33de540a6841cff1666fda41324c';

  const tx = await provider.getTransaction(txHash);
  const receipt = await provider.getTransactionReceipt(txHash);

  console.log('Transaction details:');
  console.log('Block number:', tx.blockNumber);
  console.log('To:', tx.to);
  console.log('From:', tx.from);
  console.log('Status:', receipt.status === 1 ? 'Success' : 'Failed');
  console.log('\nLogs:');
  receipt.logs.forEach((log, i) => {
    console.log(`\nLog ${i}:`);
    console.log('  Address:', log.address);
    console.log('  Topics:', log.topics);
    console.log('  Data:', log.data);
  });
}

checkTx().catch(console.error);
