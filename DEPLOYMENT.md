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

1. **Compile the contracts**
   ```bash
   # Using Hardhat
   npx hardhat compile

   # Using Foundry
   forge build
   ```

2. **Deploy McFunFactory**

   The factory contract is self-contained and includes both McFunToken and McFunAMM bytecode.

   ```solidity
   // Deploy the McFunFactory contract
   // No constructor arguments needed
   ```

3. **Update Frontend Configuration**

   After deployment, update `src/contracts/addresses.ts` with your deployed factory address:

   ```typescript
   export const MCFUN_FACTORY_ADDRESS = "YOUR_DEPLOYED_FACTORY_ADDRESS";
   ```

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

### Testnet Deployment

Before mainnet deployment, test on Sepolia or Goerli:

1. Deploy contracts to testnet
2. Update factory address in frontend
3. Test full token launch flow
4. Test trading functionality
5. Verify liquidity locking works correctly

## Security Considerations

1. **Audit Contracts** - Have contracts professionally audited before mainnet deployment
2. **Test Thoroughly** - Test all edge cases and failure scenarios
3. **Monitor Events** - Set up monitoring for suspicious activity
4. **Gas Limits** - Ensure sufficient gas limits for transactions
5. **Frontend Security** - Validate all user inputs and handle errors gracefully

## Support

For issues or questions:
- Check contract events on Etherscan
- Verify Supabase connection
- Ensure wallet is connected to correct network
- Check browser console for errors

## License

This project is open source. Use at your own risk.
