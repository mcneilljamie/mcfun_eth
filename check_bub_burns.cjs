const { ethers } = require('ethers');
require('dotenv').config();

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const BUB_ADDRESS = "0x9cd69ac55aaacfc77e5a5ba0beac0a8275a4292b";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)"
];

async function main() {
  const rpcUrl = process.env.ETHEREUM_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  console.log(`\nChecking BUB burns at ${BUB_ADDRESS}...`);
  console.log(`Burn address: ${BURN_ADDRESS}\n`);

  const token = new ethers.Contract(BUB_ADDRESS, ERC20_ABI, provider);

  const [name, symbol, totalSupply, burnedBalance] = await Promise.all([
    token.name(),
    token.symbol(),
    token.totalSupply(),
    token.balanceOf(BURN_ADDRESS)
  ]);

  const burnedAmount = Number(burnedBalance) / 1e18;
  const totalSupplyAmount = Number(totalSupply) / 1e18;
  const percentBurned = (Number(burnedBalance) / Number(totalSupply)) * 100;

  console.log(`Token: ${name} (${symbol})`);
  console.log(`Total Supply: ${totalSupplyAmount.toLocaleString()} tokens`);
  console.log(`Burned Balance: ${burnedAmount.toLocaleString()} tokens`);
  console.log(`Percent Burned: ${percentBurned.toFixed(4)}%`);

  if (burnedAmount === 0) {
    console.log("\n❌ No burns detected on-chain");
  } else {
    console.log("\n✅ Burns detected on-chain");
  }
}

main().catch(console.error);
