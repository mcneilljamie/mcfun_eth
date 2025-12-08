# McFun Deployment Guide

## Overview

McFun is a fair launch token platform on Ethereum with a native DEX. This guide will walk you through deploying the smart contracts and configuring the frontend.

## Smart Contract Deployment

### Prerequisites

1. Install Hardhat or Foundry for contract deployment
2. Have ETH on the network you want to deploy to (mainnet, Sepolia, etc.)
3. Have a wallet with private key for deployment

### Contract Files

The smart contracts are located in `src/contracts/`:
- `McFunFactory.sol` - Main factory contract that creates tokens and AMM pairs
- `McFunAMM.sol` - Automated Market Maker (xy=k constant product formula)
- `McFunToken.sol` - ERC20 token template

### Deployment Steps

#### 1. Prepare Your Environment

Create a wallet for deployment and get Sepolia ETH:

```bash
# Get Sepolia ETH from faucets:
# - https://www.alchemy.com/faucets/ethereum-sepolia
# - https://sepoliafaucet.com/
```

**Get an RPC URL** (optional but recommended for reliability):
- [Alchemy](https://www.alchemy.com/) - Free tier available
- [Infura](https://infura.io/) - Free tier available
- Public RPC: `https://rpc.sepolia.org` (already configured)

**Get an Etherscan API Key** (for contract verification):
- [Get API key](https://etherscan.io/myapikey) - Free account required

#### 2. Configure Environment Variables

Edit the `.env` file in the project root:

```bash
# Your deployer wallet private key (KEEP THIS SECRET!)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Optional: Custom RPC URL (default uses public RPC)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY

# Optional: For contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key
```

**Important**: Never commit your private key to git. The `.env` file is already in `.gitignore`.

#### 3. Compile the Contracts

```bash
npm run compile
```

This compiles all contracts in `src/contracts/`. Verify there are no compilation errors.

#### 4. Deploy to Sepolia

Run the deployment script:

```bash
npm run deploy:sepolia
```

This will:
- Deploy the McFunFactory contract
- Automatically update `src/contracts/addresses.ts` with the deployed address
- Save deployment info to `deployment-sepolia.json`
- Display the contract address and next steps

**Expected Output:**
```
Deploying contracts with account: 0x...
Account balance: 1.5 ETH
Network: sepolia (chainId: 11155111)

Deploying McFunFactory...

✅ McFunFactory deployed to: 0x1234...
Transaction hash: 0xabcd...

Factory Configuration:
- Fee Recipient: 0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc
- Trading Fee: 0.4%
- Min Liquidity: 0.1 ETH
- Total Supply per Token: 1,000,000

📝 Updating addresses.ts...
✅ Updated src/contracts/addresses.ts
✅ Saved deployment info to deployment-sepolia.json
```

#### 5. Verify Contract on Etherscan

After deployment, verify your contract:

```bash
npm run verify:sepolia
```

Or manually verify:

```bash
npx hardhat verify --network sepolia YOUR_DEPLOYED_ADDRESS
```

Verification makes your contract code public on Etherscan and allows users to interact with it directly.

### Contract Constants

The following constants are hardcoded in the contracts:

- **Fee Recipient**: `0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc` (receives 0.4% trading fees)
- **Minimum Liquidity**: 0.1 ETH
- **Minimum Liquidity Percent**: 50%
- **Total Supply**: 1,000,000 tokens per launch
- **Trading Fee**: 0.4% (4/1000)

To change these, modify the contract code before deployment.

## Frontend Deployment

### Environment Variables

The frontend uses Supabase for data storage. Environment variables are in `.env`:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

The database schema has already been created in Supabase with the following tables:

- `tokens` - Stores launched token information
- `swaps` - Records all swap transactions
- `price_snapshots` - Stores price history for charts

### Build and Deploy

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build the application**
   ```bash
   npm run build
   ```

3. **Deploy to hosting**

   Deploy the `dist` folder to any static hosting service:
   - Vercel
   - Netlify
   - AWS S3 + CloudFront
   - IPFS

## Backend Services

The platform includes two Supabase Edge Functions for indexing blockchain data:

### 1. Event Indexer (`event-indexer`)

This function monitors blockchain events and populates the database with token launches and swap data.

**Functionality:**
- Scans blockchain blocks for `TokenLaunched` events from McFunFactory
- Scans for `Swap` events from all known AMM contracts
- Inserts new tokens into the `tokens` table
- Records swaps in the `swaps` table
- Updates token reserves and volume

**Usage:**

Call the function via HTTP POST:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/event-indexer" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fromBlock": 12345678,
    "toBlock": 12345788,
    "indexTokenLaunches": true,
    "indexSwaps": true
  }'
```

**Parameters:**
- `fromBlock` (optional): Starting block number (defaults to current block - 1000)
- `toBlock` (optional): Ending block number (defaults to current block)
- `indexTokenLaunches` (optional): Whether to index token launches (default: true)
- `indexSwaps` (optional): Whether to index swaps (default: true)

**Automation:**

Set up a cron job or scheduled task to call this function periodically:

```bash
# Example: Run every 5 minutes to index recent blocks
*/5 * * * * curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/event-indexer" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"indexTokenLaunches": true, "indexSwaps": true}'
```

Or use a service like:
- GitHub Actions with scheduled workflows
- Render.com cron jobs
- EasyCron
- Vercel Cron Jobs

### 2. Price Snapshot Service (`price-snapshot`)

This function captures current prices from all tokens for historical chart data.

**Functionality:**
- Queries all tokens from the database
- Fetches current reserves and price from each AMM contract
- Stores price snapshots in the `price_snapshots` table
- Updates current reserves in the `tokens` table

**Usage:**

Call the function via HTTP POST:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/price-snapshot" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Automation:**

Set up a cron job to call this function every 1-5 minutes:

```bash
# Example: Run every 2 minutes to capture price history
*/2 * * * * curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/price-snapshot" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Recommended Schedule:**
- Active trading periods: Every 1 minute
- Normal periods: Every 2-5 minutes
- Low activity: Every 10-15 minutes

### Environment Variables

Both edge functions require the following environment variables (automatically configured in Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database writes
- `ETHEREUM_RPC_URL` - Ethereum RPC endpoint (optional, defaults to public RPC)

**Setting Custom RPC URL:**

If you want to use your own Infura/Alchemy endpoint:

1. Go to Supabase Dashboard > Project Settings > Edge Functions
2. Add secret: `ETHEREUM_RPC_URL` = `https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY`

### Monitoring

Both functions return detailed JSON responses:

**Event Indexer Response:**
```json
{
  "tokensIndexed": 5,
  "swapsIndexed": 127,
  "errors": [],
  "fromBlock": 12345678,
  "toBlock": 12345788
}
```

**Price Snapshot Response:**
```json
{
  "snapshotsCreated": 42,
  "errors": [],
  "timestamp": "2024-12-08T12:34:56Z"
}
```

Monitor the `errors` array for any issues. Set up alerts if errors occur frequently.

### Initial Data Population

After deploying contracts, run the event indexer with a specific block range to populate historical data:

```bash
# Index from contract deployment block to current
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/event-indexer" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fromBlock": DEPLOYMENT_BLOCK_NUMBER,
    "indexTokenLaunches": true,
    "indexSwaps": true
  }'
```

Then immediately run the price snapshot service to populate initial chart data:

```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/price-snapshot" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Testing

### Local Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Connect MetaMask to your local network or testnet

3. Make sure you have test ETH in your wallet

### Testnet Deployment Checklist

Before mainnet deployment, thoroughly test on Sepolia:

**Contract Deployment:**
- [ ] Deploy McFunFactory to Sepolia
- [ ] Verify contract on Etherscan
- [ ] Confirm factory address updated in `src/contracts/addresses.ts`

**Frontend Testing:**
- [ ] Build frontend: `npm run build`
- [ ] Connect MetaMask to Sepolia network
- [ ] Ensure you have Sepolia ETH for gas

**Token Launch Testing:**
- [ ] Launch a test token through the UI
- [ ] Verify token appears in token list
- [ ] Confirm TokenLaunched event emitted
- [ ] Check initial liquidity locked correctly

**Trading Testing:**
- [ ] Buy tokens (ETH → Token)
- [ ] Sell tokens (Token → ETH)
- [ ] Verify swap amounts calculated correctly
- [ ] Confirm 0.4% fee deducted
- [ ] Check reserves update after each swap

**Edge Cases:**
- [ ] Try trading with very small amounts
- [ ] Test with insufficient liquidity
- [ ] Verify slippage protection works
- [ ] Test minimum liquidity requirements

**Backend Services:**
- [ ] Deploy event-indexer function
- [ ] Deploy price-snapshot function
- [ ] Run manual indexing from deployment block
- [ ] Verify tokens and swaps appear in database
- [ ] Check price charts display correctly

## Security Considerations

1. **Audit Contracts** - Have contracts professionally audited before mainnet deployment
2. **Test Thoroughly** - Test all edge cases and failure scenarios
3. **Monitor Events** - Set up monitoring for suspicious activity
4. **Gas Limits** - Ensure sufficient gas limits for transactions
5. **Frontend Security** - Validate all user inputs and handle errors gracefully

## Troubleshooting

### Deployment Issues

**Error: "Cannot read properties of undefined (reading 'getAddress')"**
- Make sure you've added your `DEPLOYER_PRIVATE_KEY` to `.env`
- Ensure the private key starts with `0x`
- Verify you have Sepolia ETH in your deployer wallet

**Error: "insufficient funds for intrinsic transaction cost"**
- Get more Sepolia ETH from faucets
- Check your wallet balance: The deployment costs ~0.02-0.05 ETH

**Error: "nonce has already been used"**
- Clear Hardhat cache: `npx hardhat clean`
- Try again after a few minutes

**Verification fails on Etherscan**
- Wait 1-2 minutes after deployment before verifying
- Ensure `ETHERSCAN_API_KEY` is set in `.env`
- Check that Solidity version matches (0.8.20)

### Frontend Issues

**Contract not found / Invalid address**
- Verify `MCFUN_FACTORY_ADDRESS` in `src/contracts/addresses.ts` is correct
- Ensure you're connected to the right network (Sepolia or Mainnet)
- Check that the contract is verified on Etherscan

**Transactions failing**
- Increase gas limit in MetaMask
- Ensure sufficient ETH for gas
- Check that you meet minimum liquidity requirements (0.1 ETH)

**No tokens showing in UI**
- Verify event-indexer function is running
- Check Supabase database for token entries
- Run manual indexing from deployment block

### Backend Services Issues

**Event indexer not finding events**
- Verify `ETHEREUM_RPC_URL` is set correctly
- Ensure the factory contract address matches in both frontend and edge function
- Check that you're indexing from the correct starting block

**Price charts not displaying**
- Run price-snapshot function manually to populate initial data
- Verify Supabase `price_snapshots` table has entries
- Check that cron jobs are running

## Support

For issues or questions:
- Check contract events on [Sepolia Etherscan](https://sepolia.etherscan.io/)
- Verify Supabase connection and database tables
- Ensure wallet is connected to correct network
- Check browser console for errors
- Review Hardhat compilation output for errors

## License

This project is open source. Use at your own risk.
