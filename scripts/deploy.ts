import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Starting McFun deployment...\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name, `(chainId: ${network.chainId})\n`);

  console.log("Deploying McFunFactory...");
  const McFunFactory = await ethers.getContractFactory("McFunFactory");
  const factory = await McFunFactory.deploy();

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("\n✅ McFunFactory deployed to:", factoryAddress);
  console.log("Transaction hash:", factory.deploymentTransaction()?.hash);

  const feeRecipient = await factory.feeRecipient();
  console.log("\nFactory Configuration:");
  console.log("- Fee Recipient:", feeRecipient);
  console.log("- Trading Fee: 0.4%");
  console.log("- Min Liquidity: 0.1 ETH");
  console.log("- Total Supply per Token: 1,000,000");

  console.log("\n📝 Updating addresses.ts...");
  const addressesPath = path.join(__dirname, "../src/contracts/addresses.ts");
  const addressesContent = `export const MCFUN_FACTORY_ADDRESS = "${factoryAddress}";

export const FEE_RECIPIENT = "${feeRecipient}";
export const MIN_LIQUIDITY_ETH = "0.1";
export const MIN_LIQUIDITY_PERCENT = 50;
export const RECOMMENDED_LIQUIDITY_PERCENT = 75;
export const TOTAL_SUPPLY = 1_000_000;
export const FEE_PERCENT = 0.4;
`;

  fs.writeFileSync(addressesPath, addressesContent);
  console.log("✅ Updated src/contracts/addresses.ts");

  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    factoryAddress: factoryAddress,
    feeRecipient: feeRecipient,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    txHash: factory.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(__dirname, `../deployment-${network.name}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info to deployment-${network.name}.json`);

  console.log("\n🎉 Deployment complete!");
  console.log("\n📋 Next Steps:");
  console.log("1. Verify the contract on Etherscan:");
  console.log(`   npx hardhat verify --network ${network.name} ${factoryAddress}`);
  console.log("\n2. Test the deployment:");
  console.log("   - Launch a test token through the UI");
  console.log("   - Perform test swaps");
  console.log("   - Verify events are emitted correctly");
  console.log("\n3. Set up backend services:");
  console.log("   - Deploy event-indexer edge function");
  console.log("   - Deploy price-snapshot edge function");
  console.log("   - Set up cron jobs for both services");
  console.log("\n4. Update frontend:");
  console.log("   - Build: npm run build");
  console.log("   - Deploy to hosting service");

  if (network.name === "sepolia") {
    console.log("\n💡 Get Sepolia ETH from:");
    console.log("   https://www.alchemy.com/faucets/ethereum-sepolia");
    console.log("   https://sepoliafaucet.com/");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
