const hre = require("hardhat");

async function main() {
  // Get factory address from env var or command line argument
  const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || process.argv[2];

  if (!FACTORY_ADDRESS) {
    console.error("❌ Error: Factory address is required");
    console.error("\nUsage:");
    console.error("  FACTORY_ADDRESS=0x... npx hardhat run scripts/deploy-locker.cjs --network mainnet");
    console.error("  OR");
    console.error("  npx hardhat run scripts/deploy-locker.cjs --network mainnet 0x...");
    process.exit(1);
  }

  const network = await hre.ethers.provider.getNetwork();
  console.log(`Deploying TokenLocker contract to ${network.name}...`);
  console.log(`Using Factory Address: ${FACTORY_ADDRESS}`);

  const TokenLocker = await hre.ethers.getContractFactory("TokenLocker");
  const locker = await TokenLocker.deploy(FACTORY_ADDRESS);

  await locker.waitForDeployment();

  const lockerAddress = await locker.getAddress();
  console.log("TokenLocker deployed to:", lockerAddress);
  console.log("McFun Factory:", FACTORY_ADDRESS);

  console.log("\nWaiting for block confirmations...");
  await locker.deploymentTransaction().wait(6);

  console.log("\nVerifying contract on Etherscan...");
  try {
    await hre.run("verify:verify", {
      address: lockerAddress,
      constructorArguments: [FACTORY_ADDRESS],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.log("Verification error:", error.message);
  }

  const network = await hre.ethers.provider.getNetwork();
  console.log("\n=== Deployment Summary ===");
  console.log("TokenLocker Address:", lockerAddress);
  console.log("McFun Factory Address:", FACTORY_ADDRESS);
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("\nUpdate this address in: src/contracts/addresses.ts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
