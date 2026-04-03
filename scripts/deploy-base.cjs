const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting McFun deployment to Base...\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name, `(chainId: ${network.chainId})\n`);

  if (Number(network.chainId) !== 8453) {
    throw new Error(`Expected Base mainnet (chainId 8453), got chainId ${network.chainId}`);
  }

  // Deploy McFunFactory
  console.log("Deploying McFunFactory...");
  const McFunFactory = await ethers.getContractFactory("McFunFactory");
  const factory = await McFunFactory.deploy();

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("\n✅ McFunFactory deployed to:", factoryAddress);
  console.log("Transaction hash:", factory.deploymentTransaction()?.hash);

  // Deploy TokenLocker
  console.log("\nDeploying TokenLocker...");
  const TokenLocker = await ethers.getContractFactory("TokenLocker");
  const locker = await TokenLocker.deploy(factoryAddress);

  await locker.waitForDeployment();
  const lockerAddress = await locker.getAddress();

  console.log("\n✅ TokenLocker deployed to:", lockerAddress);
  console.log("Transaction hash:", locker.deploymentTransaction()?.hash);

  const feeRecipient = "0x993AEe79ee816B636D80f06186325b19a0eE3D45";
  console.log("\nFactory Configuration:");
  console.log("- Fee Recipient:", feeRecipient, "(hardcoded in McFunAMM)");
  console.log("- Trading Fee: 0.8% (Base network)");
  console.log("- Min Liquidity: 0.01 ETH (Base network)");
  console.log("- Total Supply per Token: 1,000,000");

  // Update addresses.ts with Base addresses
  console.log("\n📝 Updating addresses.ts...");
  const addressesPath = path.join(__dirname, "../src/contracts/addresses.ts");
  let addressesContent = fs.readFileSync(addressesPath, "utf-8");

  // Update Base factory address
  addressesContent = addressesContent.replace(
    /8453: \{[\s\S]*?factoryAddress: '[^']*'/,
    `8453: {\n    name: 'Base Mainnet',\n    shortName: 'Base',\n    factoryAddress: '${factoryAddress}'`
  );

  // Update Base locker address
  addressesContent = addressesContent.replace(
    /(8453: \{[\s\S]*?)lockerAddress: '[^']*'/,
    `$1lockerAddress: '${lockerAddress}'`
  );

  fs.writeFileSync(addressesPath, addressesContent);
  console.log("✅ Updated src/contracts/addresses.ts with Base addresses");

  // Save deployment info
  const deploymentInfo = {
    network: "base",
    chainId: 8453,
    factoryAddress: factoryAddress,
    lockerAddress: lockerAddress,
    feeRecipient: feeRecipient,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    factoryTxHash: factory.deploymentTransaction()?.hash,
    lockerTxHash: locker.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(__dirname, "../deployment-base.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info to deployment-base.json`);

  console.log("\n🎉 Base Deployment complete!");
  console.log("\n📋 Next Steps:");
  console.log("1. Verify the contracts on Basescan:");
  console.log(`   npx hardhat verify --network base ${factoryAddress}`);
  console.log(`   npx hardhat verify --network base ${lockerAddress} ${factoryAddress}`);
  console.log("\n2. Test the deployment:");
  console.log("   - Switch your wallet to Base network");
  console.log("   - Launch a test token through the UI");
  console.log("   - Perform test swaps");
  console.log("   - Verify events are emitted correctly");
  console.log("\n3. Update backend services:");
  console.log("   - Configure edge functions to index Base events");
  console.log("   - Update cron jobs to include Base chain");
  console.log("\n4. Update frontend:");
  console.log("   - Build: npm run build");
  console.log("   - Deploy to hosting service");
  console.log("\n💰 Contract Addresses:");
  console.log(`   Factory: ${factoryAddress}`);
  console.log(`   Locker: ${lockerAddress}`);
  console.log(`   View on Basescan: https://basescan.org/address/${factoryAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
