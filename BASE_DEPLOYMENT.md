# Base Mainnet Deployment

## Deployment Summary

**Network:** Base Mainnet (Chain ID: 8453)
**Deployment Date:** April 3, 2026
**Deployer Address:** 0x48250CcfFC44b72C615151084e9018A746b826B4

## Deployed Contracts

### McFunFactory
- **Address:** `0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2`
- **Transaction:** `0x82c85301b49bebbe64521fdb8c7764bf7c7518a5b8e592683be85ae8c869f897`
- **Basescan:** https://basescan.org/address/0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2

### TokenLocker
- **Address:** `0x49Fd91582C442ae01f3d1Db28272b7B053D38b79`
- **Transaction:** `0x14eb6c49e5aae92ecacd3e0a459ad74c8c9a415d014a24796e2e2245f61fbb7c`
- **Basescan:** https://basescan.org/address/0x49Fd91582C442ae01f3d1Db28272b7B053D38b79

## Configuration

### Base Network Settings
- **Trading Fee:** 0.8%
- **Minimum Liquidity:** 0.01 ETH
- **Token Total Supply:** 1,000,000 tokens
- **Fee Recipient:** 0x993AEe79ee816B636D80f06186325b19a0eE3D45

## Next Steps

### 1. Contract Verification
Verify the contracts on Basescan for transparency:

```bash
npx hardhat verify --network base 0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2
npx hardhat verify --network base 0x49Fd91582C442ae01f3d1Db28272b7B053D38b79 0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2
```

### 2. Backend Services Configuration

Update the following edge functions to index Base events:
- `event-indexer` - Index swap events from Base
- `lock-event-indexer` - Index token lock events from Base
- `burn-event-indexer` - Index burn events from Base
- `price-snapshot` - Track price snapshots for Base tokens
- `track-eth-price` - Track ETH price for Base network

Add Base-specific configuration to edge functions:
```typescript
const BASE_FACTORY_ADDRESS = "0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2";
const BASE_LOCKER_ADDRESS = "0x49Fd91582C442ae01f3d1Db28272b7B053D38b79";
const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;
```

### 3. Database Updates

Create a migration to support multi-chain indexing:
- Add `chain_id` column to relevant tables (tokens, swaps, token_locks, burn_totals)
- Update indexes to include chain_id
- Update RLS policies to handle multi-chain data
- Update aggregation functions to filter by chain_id

### 4. Frontend Testing

Test the deployment:
1. Switch MetaMask to Base network
2. Launch a test token
3. Perform test swaps
4. Lock tokens
5. Verify all events are captured correctly

### 5. Production Deployment

Once testing is complete:
1. Build the frontend: `npm run build`
2. Deploy to your hosting service
3. Update DNS/CDN if needed
4. Monitor transactions on Basescan

## Important Notes

- The contracts use the same fee recipient address across all chains
- Base has a lower minimum liquidity (0.01 ETH vs 0.1 ETH on Ethereum)
- Base has a higher trading fee (0.8% vs 0.4% on Ethereum)
- All contract addresses have been updated in `src/contracts/addresses.ts`
- Deployment info saved to `deployment-base.json`

## Support

For issues or questions:
- Check Basescan for transaction status
- Verify contract addresses in the frontend
- Ensure backend services are indexing Base events
- Monitor gas prices on Base network
