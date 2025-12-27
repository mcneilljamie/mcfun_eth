const { ethers } = require('ethers');

const LOCKER_ADDRESS = "0x1277b6E3f4407AD44A9b33641b51848c0098368f";
const LOCKER_ABI = [
  "function getLock(uint256 lockId) view returns (address owner, address tokenAddress, uint256 amount, uint256 unlockTime, bool withdrawn)",
];

async function checkLock() {
  const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  const contract = new ethers.Contract(LOCKER_ADDRESS, LOCKER_ABI, provider);

  const lockInfo = await contract.getLock(32);
  console.log('Lock 32 on-chain status:');
  console.log('Owner:', lockInfo[0]);
  console.log('Token:', lockInfo[1]);
  console.log('Amount:', lockInfo[2].toString());
  console.log('Unlock Time:', new Date(Number(lockInfo[3]) * 1000).toISOString());
  console.log('Withdrawn:', lockInfo[4]);
}

checkLock().catch(console.error);
