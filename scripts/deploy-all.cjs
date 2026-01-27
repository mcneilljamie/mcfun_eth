const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting McFun Full Deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name, `(chainId: ${network.chainId})\n`);

  console.log("Step 1/2: Deploying McFunFactory...");
  const McFunFactory = await hre.ethers.getContractFactory("McFunFactory");
  const factory = await McFunFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("✅ McFunFactory deployed to:", factoryAddress);
  console.log("   Transaction hash:", factory.deploymentTransaction()?.hash);

  console.log("\nStep 2/2: Deploying TokenLocker...");
  const TokenLocker = await hre.ethers.getContractFactory("TokenLocker");
  const locker = await TokenLocker.deploy(factoryAddress);
  await locker.waitForDeployment();
  const lockerAddress = await locker.getAddress();

  console.log("✅ TokenLocker deployed to:", lockerAddress);
  console.log("   Transaction hash:", locker.deploymentTransaction()?.hash);

  const feeRecipient = "0x993AEe79ee816B636D80f06186325b19a0eE3D45";

  console.log("\n" + "=".repeat(60));
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Network:         ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer:        ${deployer.address}`);
  console.log(`Factory:         ${factoryAddress}`);
  console.log(`TokenLocker:     ${lockerAddress}`);
  console.log(`Fee Recipient:   ${feeRecipient} (hardcoded in McFunAMM)`);
  console.log("=".repeat(60));

  const deploymentInfo = {
    network: network.name,
    chainId: Number(network.chainId),
    factoryAddress: factoryAddress,
    lockerAddress: lockerAddress,
    feeRecipient: feeRecipient,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    factoryTxHash: factory.deploymentTransaction()?.hash,
    lockerTxHash: locker.deploymentTransaction()?.hash,
  };

  const deploymentPath = path.join(__dirname, `../deployment-${network.name}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n✅ Saved deployment info to deployment-${network.name}.json`);

  console.log("\n📝 Update src/contracts/addresses.ts with these addresses:");
  console.log(`  factoryAddress: '${factoryAddress}',`);
  console.log(`  lockerAddress: '${lockerAddress}',`);

  console.log("\n🔧 REQUIRED: Configure Supabase Edge Function Environment Variables:");
  console.log("=".repeat(60));
  console.log("Go to: Supabase Dashboard → Settings → Edge Functions");
  console.log("Add the following environment variables:");
  console.log("");
  console.log(`MCFUN_CHAIN_ID=${network.chainId}`);
  console.log(`MCFUN_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`MCFUN_LOCKER_ADDRESS=${lockerAddress}`);

  const currentBlock = await hre.ethers.provider.getBlockNumber();
  console.log(`MCFUN_LOCKER_DEPLOYMENT_BLOCK=${currentBlock}`);

  console.log("MCFUN_RPC_URL=<your_primary_rpc_url>");
  console.log("MCFUN_RPC_URL_FALLBACKS=<fallback1>,<fallback2>,<fallback3>");
  console.log("=".repeat(60));

  console.log("\n📋 Next Steps:");
  console.log("1. Wait for block confirmations (recommended: 6 blocks)");
  console.log("\n2. Verify contracts on Etherscan:");
  console.log(`   npx hardhat verify --network ${network.name} ${factoryAddress}`);
  console.log(`   npx hardhat verify --network ${network.name} ${lockerAddress} ${factoryAddress}`);
  console.log("\n3. Update src/contracts/addresses.ts with deployed addresses");
  console.log("\n4. Configure Supabase environment variables (see above)");
  console.log("\n5. Build and deploy frontend:");
  console.log("   npm run build");
  console.log("\n6. Test deployment:");
  console.log("   - Launch a test token");
  console.log("   - Perform buy/sell swaps");
  console.log(`   - Verify fees land in ${feeRecipient}`);

  console.log("\n🎉 Deployment Complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
