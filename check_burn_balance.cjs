const { ethers } = require('ethers');

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const TOKEN_ADDRESS = '0x23Fe52cb410c33dcDC5B15095399882e8d24d200';

async function checkBurnBalance() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const tokenContract = new ethers.Contract(
    TOKEN_ADDRESS,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  
  const burnBalance = await tokenContract.balanceOf(BURN_ADDRESS);
  const burnBalanceFormatted = ethers.formatEther(burnBalance);
  
  console.log('Token:', TOKEN_ADDRESS);
  console.log('Burn Address:', BURN_ADDRESS);
  console.log('Current burn balance:', burnBalanceFormatted, 'tokens');
  console.log('Raw balance:', burnBalance.toString());
  console.log('Percent of 1M supply:', (Number(burnBalance) / 1e24 * 100).toFixed(4) + '%');
}

checkBurnBalance().catch(console.error);
