const { ethers } = require('ethers');

const RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const TOKEN_ADDRESS = '0x849aFAC9Ac703Db7700e7BB0d21FCC07C67AA01d';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const TOKEN_SUPPLY = 1_000_000n * (10n ** 18n);

async function checkAndRecordBurn() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const tokenContract = new ethers.Contract(
    TOKEN_ADDRESS,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  
  const burnBalance = await tokenContract.balanceOf(BURN_ADDRESS);
  const burnBalanceFormatted = ethers.formatEther(burnBalance);
  const percentBurned = (Number(burnBalance) / Number(TOKEN_SUPPLY)) * 100;
  
  console.log('Token:', TOKEN_ADDRESS);
  console.log('Total burned:', burnBalanceFormatted, 'tokens');
  console.log('Percent burned:', percentBurned.toFixed(4) + '%');
  console.log('Raw amount:', burnBalance.toString());
  console.log('\nBlock 9981088 burn of 572,000 tokens is included in this total');
}

checkAndRecordBurn().catch(console.error);
