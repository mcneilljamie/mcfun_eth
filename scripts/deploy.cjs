const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting McFun deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", network.name, `(chainId: ${network.chainId})\n`);

  console.log("Deploying McFunFactory...");
  const McFunFactory = await hre.ethers.getContractFactory("McFunFactory");
  const factory = await McFunFactory.deploy();

  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  console.log("\n✅ McFunFactory deployed to:", factoryAddress);
  console.log("Transaction hash:", factory.deploymentTransaction()?.hash);

  const feeRecipient = "0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc";
  console.log("\nFactory Configuration:");
  console.log("- Fee Recipient:", feeRecipient);
  console.log("- Trading Fee: 0.4%");
  console.log("- Min Liquidity: 0.1 ETH");
  console.log("- Total Supply per Token: 1,000,000");

  console.log("\n📝 Updating addresses.ts...");
  const addressesPath = path.join(__dirname, "../src/contracts/addresses.ts");

  // Read the current addresses.ts file
  let addressesContent = fs.readFileSync(addressesPath, 'utf8');

  // Update the factory address for the deployed network
  const chainId = Number(network.chainId);
  const factoryAddressRegex = new RegExp(
    `(${chainId}:\\s*{[^}]*factoryAddress:\\s*['"])([^'"]*)(["'][^}]*})`,
    's'
  );

  if (factoryAddressRegex.test(addressesContent)) {
    // Update existing chain config
    addressesContent = addressesContent.replace(
      factoryAddressRegex,
      `$1${factoryAddress}$3`
    );
    console.log(`✅ Updated factoryAddress for chain ${chainId}`);
  } else {
    // Add new chain config if it doesn't exist
    const networkConfigMatch = addressesContent.match(/(export const NETWORK_CONFIG[^{]*{)([^}]*)(}\s*as const;?)/s);
    if (networkConfigMatch) {
      const newChainConfig = `  ${chainId}: {
    name: '${network.name}',
    factoryAddress: '${factoryAddress}',
    explorerUrl: 'https://${network.name === 'mainnet' ? '' : network.name + '.'}etherscan.io',
  },
`;
      addressesContent = addressesContent.replace(
        networkConfigMatch[0],
        `${networkConfigMatch[1]}${networkConfigMatch[2]}${newChainConfig}${networkConfigMatch[3]}`
      );
      console.log(`✅ Added new chain config for ${network.name} (${chainId})`);
    }
  }

  // Update SUPPORTED_CHAIN_IDS if the new chain isn't listed
  const supportedChainIdsMatch = addressesContent.match(/export const SUPPORTED_CHAIN_IDS = \[([^\]]*)\]/);
  if (supportedChainIdsMatch) {
    const supportedChainIds = supportedChainIdsMatch[1]
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (!supportedChainIds.includes(String(chainId))) {
      const newSupportedChainIds = [...supportedChainIds, String(chainId)].sort((a, b) => Number(a) - Number(b));
      addressesContent = addressesContent.replace(
        /export const SUPPORTED_CHAIN_IDS = \[([^\]]*)\]/,
        `export const SUPPORTED_CHAIN_IDS = [${newSupportedChainIds.join(', ')}]`
      );
      console.log(`✅ Added chain ${chainId} to SUPPORTED_CHAIN_IDS`);
    }
  }

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
