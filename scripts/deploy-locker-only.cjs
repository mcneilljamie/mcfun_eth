const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying TokenLocker to Base...\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name, `(chainId: ${network.chainId})\n`);

  const factoryAddress = "0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2";
  console.log("Factory Address:", factoryAddress);

  // Deploy TokenLocker
  console.log("\nDeploying TokenLocker...");
  const TokenLocker = await ethers.getContractFactory("TokenLocker");
  const locker = await TokenLocker.deploy(factoryAddress);

  await locker.waitForDeployment();
  const lockerAddress = await locker.getAddress();

  console.log("\n✅ TokenLocker deployed to:", lockerAddress);
  console.log("Transaction hash:", locker.deploymentTransaction()?.hash);

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
    feeRecipient: "0x993AEe79ee816B636D80f06186325b19a0eE3D45",
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    lockerTxHash: locker.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(__dirname, "../deployment-base.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`✅ Saved deployment info to deployment-base.json`);

  console.log("\n🎉 Base Deployment complete!");
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
