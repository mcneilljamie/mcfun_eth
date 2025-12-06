# Jamm.Fi Deployment Guide

## Overview

Jamm.Fi is a fair launch token platform on Ethereum with a native DEX. This guide will walk you through deploying the smart contracts and configuring the frontend.

## Smart Contract Deployment

### Prerequisites

1. Install Hardhat or Foundry for contract deployment
2. Have ETH on the network you want to deploy to (mainnet, Sepolia, etc.)
3. Have a wallet with private key for deployment

### Contract Files

The smart contracts are located in `src/contracts/`:
- `JammFactory.sol` - Main factory contract that creates tokens and AMM pairs
- `JammAMM.sol` - Automated Market Maker (xy=k constant product formula)
- `JammToken.sol` - ERC20 token template

### Deployment Steps

1. **Compile the contracts**
   ```bash
   # Using Hardhat
   npx hardhat compile

   # Using Foundry
   forge build
   ```

2. **Deploy JammFactory**

   The factory contract is self-contained and includes both JammToken and JammAMM bytecode.

   ```solidity
   // Deploy the JammFactory contract
   // No constructor arguments needed
   ```

3. **Update Frontend Configuration**

   After deployment, update `src/contracts/addresses.ts` with your deployed factory address:

   ```typescript
   export const JAMM_FACTORY_ADDRESS = "YOUR_DEPLOYED_FACTORY_ADDRESS";
   ```

### Contract Constants

The following constants are hardcoded in the contracts:

- **Fee Recipient**: `0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc` (receives 0.4% trading fees)
- **Minimum Liquidity**: 0.1 ETH
- **Minimum Liquidity Percent**: 25%
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

## Backend Services (Optional)

For the platform to be fully functional, you'll need to implement backend services to:

1. **Event Indexer** - Listen for blockchain events and update the database
   - Listen for `TokenLaunched` events from JammFactory
   - Listen for `Swap` events from all AMM contracts
   - Update `tokens`, `swaps`, and `price_snapshots` tables

2. **Price Snapshot Service** - Periodically capture price data
   - Run every 5-15 minutes
   - Query AMM reserves and calculate prices
   - Store in `price_snapshots` table

These can be implemented as:
- Supabase Edge Functions
- AWS Lambda functions
- Separate Node.js services
- Subgraph (The Graph Protocol)

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
