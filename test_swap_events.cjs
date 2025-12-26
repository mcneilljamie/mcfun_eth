const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

const AMM_ABI = [
  "event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut)",
];

const ammAddress = '0x45c0C07a34158102C7AdC6A10faBf425ACb06977';

async function testSwapEvents() {
  const amm = new ethers.Contract(ammAddress, AMM_ABI, provider);

  console.log('Testing Swap event query for WACK token...');
  console.log('AMM Address:', ammAddress);
  console.log('Block range: 9920840 to 9921065');

  try {
    const filter = amm.filters.Swap();
    console.log('Filter:', filter);

    const events = await amm.queryFilter(filter, 9920840, 9921065);
    console.log(`Found ${events.length} Swap events`);

    for (const event of events) {
      console.log('\nEvent:', {
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        args: {
          user: event.args.user,
          ethIn: ethers.formatEther(event.args.ethIn),
          tokenIn: ethers.formatEther(event.args.tokenIn),
          ethOut: ethers.formatEther(event.args.ethOut),
          tokenOut: ethers.formatEther(event.args.tokenOut),
        }
      });
    }
  } catch (error) {
    console.error('Error querying events:', error);
  }
}

testSwapEvents();
