const hre = require("hardhat");

async function main() {
  console.log("Deploying TokenLocker contract to Sepolia...");

  const TokenLocker = await hre.ethers.getContractFactory("TokenLocker");
  const locker = await TokenLocker.deploy();

  await locker.waitForDeployment();

  const lockerAddress = await locker.getAddress();
  console.log("TokenLocker deployed to:", lockerAddress);

  console.log("\nWaiting for block confirmations...");
  await locker.deploymentTransaction().wait(6);

  console.log("\nVerifying contract on Etherscan...");
  try {
    await hre.run("verify:verify", {
      address: lockerAddress,
      constructorArguments: [],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.log("Verification error:", error.message);
  }

  console.log("\n=== Deployment Summary ===");
  console.log("TokenLocker Address:", lockerAddress);
  console.log("Network: Sepolia");
  console.log("\nUpdate this address in: src/contracts/addresses.ts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
