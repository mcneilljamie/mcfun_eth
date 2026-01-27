# McFun Mainnet Deployment Guide

This document contains all information needed to operate the McFun platform on Ethereum Mainnet.

## Deployment Summary

**Network:** Ethereum Mainnet (Chain ID: 1)
**Deployment Date:** 2026-01-27
**Deployer:** 0x25Dc901f99b0431397b8Bf3f24c2c097e85F44AB

### Deployed Contracts

| Contract | Address | Etherscan |
|----------|---------|-----------|
| McFunFactory | `0x6E8717dd111Bea3f5B12785798F3d1380c01D72B` | [View](https://etherscan.io/address/0x6E8717dd111Bea3f5B12785798F3d1380c01D72B) |
| TokenLocker | `0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38` | [View](https://etherscan.io/address/0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38) |
| Fee Recipient (Multisig) | `0x993AEe79ee816B636D80f06186325b19a0eE3D45` | [View](https://etherscan.io/address/0x993AEe79ee816B636D80f06186325b19a0eE3D45) |

**Locker Deployment Block:** 24328123

---

## Environment Variables Configuration

### Frontend (.env for Vite)

```bash
# Supabase Configuration (already configured)
VITE_SUPABASE_URL=https://mulgpdxllortyotcdjqj.supabase.co
VITE_SUPABASE_ANON_KEY=<your_supabase_anon_key>

# Network Configuration
VITE_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

**Note:** Contract addresses are already configured in `src/contracts/addresses.ts`.

### Supabase Edge Functions

**Status:** ✅ All edge functions deployed with automatic secret configuration

**Deployed Functions:**
- event-indexer - Indexes token launches and swaps
- lock-event-indexer - Indexes token locks and unlocks
- register-token-launch - Handles manual token registration
- burn-event-indexer - Tracks token burns
- detect-lock-gaps - Validates lock data integrity
- sync-lock-withdrawals - Syncs withdrawal status

**Environment Variables (Automatically Configured):**
- MCFUN_CHAIN_ID=1
- MCFUN_FACTORY_ADDRESS=0x6E8717dd111Bea3f5B12785798F3d1380c01D72B
- MCFUN_LOCKER_ADDRESS=0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38
- MCFUN_LOCKER_DEPLOYMENT_BLOCK=24328123
- MCFUN_RPC_URL (automatically configured)
- MCFUN_RPC_URL_FALLBACKS (automatically configured)

---

## Protocol Configuration

### Fee Structure (Immutable - Hardcoded in McFunAMM.sol)
- **Trading Fee:** 0.4% per swap
- **Fee Recipient:** `0x993AEe79ee816B636D80f06186325b19a0eE3D45` (Multisig)
- **Fee Collection:** Automatic on every swap, sent directly to multisig

### Token Launch Parameters
- **Total Supply per Token:** 1,000,000 tokens
- **Minimum Liquidity:** 0.1 ETH
- **Permanent Lock:** First 1000 wei of LP tokens burned to address(0)
- **LP Tokens:** All remaining LP tokens sent to dead address (0x...dEaD)

---

## Post-Deployment Checklist

### 1. Verify Contracts on Etherscan ✅ (Complete these)

```bash
# Verify Factory
npx hardhat verify --network mainnet 0x6E8717dd111Bea3f5B12785798F3d1380c01D72B

# Verify TokenLocker
npx hardhat verify --network mainnet 0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38 0x6E8717dd111Bea3f5B12785798F3d1380c01D72B
```

### 2. Edge Functions (✅ Already Deployed)
All edge functions are deployed and configured:
- ✅ event-indexer
- ✅ lock-event-indexer
- ✅ register-token-launch
- ✅ burn-event-indexer
- ✅ detect-lock-gaps
- ✅ sync-lock-withdrawals

### 3. Initialize Database Indexing
Trigger initial indexing to start populating the database:

```bash
# Trigger event indexer (will index from deployment block forward)
curl -X POST "https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/event-indexer" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"

# Trigger lock indexer
curl -X POST "https://mulgpdxllortyotcdjqj.supabase.co/functions/v1/lock-event-indexer" \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
```

### 4. Build and Deploy Frontend
```bash
# Build production frontend (already done)
npm run build

# Test build locally
npm run preview

# Deploy dist/ to your hosting provider
```

### 5. Smoke Test Deployment

**Test Token Launch:**
- [ ] Launch a test token with 0.1 ETH initial liquidity
- [ ] Verify token appears in database (`tokens` table)
- [ ] Verify TokenLaunched event indexed correctly
- [ ] Check token page displays correctly in UI

**Test Trading:**
- [ ] Buy tokens (ETH → Token swap)
- [ ] Verify 0.4% fee sent to `0x993AEe79ee816B636D80f06186325b19a0eE3D45`
- [ ] Check balance increased in multisig
- [ ] Sell tokens (Token → ETH swap)
- [ ] Verify 0.4% fee sent to multisig again
- [ ] Verify swaps indexed in database (`swaps` table)

**Test Token Locking:**
- [ ] Lock test tokens for 30 days
- [ ] Verify lock appears in database (`token_locks` table)
- [ ] Check lock displays on Token page
- [ ] Check lock displays in MyLocks page

**Test Price Charts:**
- [ ] Verify price chart updates after swaps
- [ ] Check 24h price change displays correctly
- [ ] Verify volume statistics are accurate

### 6. Monitor Multisig Fee Collection
- Add Etherscan alert for `0x993AEe79ee816B636D80f06186325b19a0eE3D45`
- Monitor incoming ETH from trading fees
- Expected: 0.4% of every swap volume

---

## Operational Monitoring

### Critical Metrics to Monitor

1. **Contract Health**
   - Factory contract balance (should be near zero - all funds in AMMs)
   - Fee recipient balance (should increase with trading)
   - TokenLocker contract balance (should match total locked value)

2. **Indexer Health**
   - Check `indexer_state` table for last indexed block
   - Should be within 1-2 blocks of current mainnet block
   - If lagging, check Supabase edge function logs

3. **Database Performance**
   - Monitor `swaps` table insert rate
   - Monitor `price_snapshots` table size
   - Check cron job execution success rate

4. **Frontend Performance**
   - Monitor RPC rate limits
   - Check Supabase API response times
   - Track user errors in browser console

### Alerting Recommendations

Set up alerts for:
- Edge function errors (check Supabase logs)
- Indexer lag > 100 blocks behind
- RPC provider failures
- Unexpected contract balance changes
- Fee recipient not receiving fees

---

## Security Considerations

### Immutable Contract Design
- **No admin keys:** Contracts cannot be upgraded or paused
- **No owner functions:** Fee recipient is hardcoded, cannot be changed
- **No emergency withdrawals:** Liquidity is permanently locked
- **No contract upgrades:** Deploy address is final

### Operational Security
- **Multisig control:** All protocol fees go to multisig for governance
- **Database RLS:** All tables have Row Level Security enabled
- **Rate limiting:** Edge functions have rate limiting for public endpoints
- **Environment variables:** Sensitive data (RPC keys) in env vars only

### Risks and Mitigations
1. **RPC Provider Downtime**
   - Mitigation: Multiple fallback RPC URLs configured
   - Action: Monitor and rotate providers as needed

2. **Database Indexing Failures**
   - Mitigation: Gap detection and automatic retry logic
   - Action: Manual reindexing possible via edge function triggers

3. **Frontend Hosting Downtime**
   - Mitigation: Contracts are directly accessible via Etherscan
   - Action: Users can interact directly with verified contracts

---

## Support and Troubleshooting

### Common Issues

**Issue:** "Network not supported" error in UI
- **Solution:** Ensure user is connected to Ethereum Mainnet (Chain ID 1)
- **Solution:** Check MetaMask/wallet network configuration

**Issue:** Swaps not appearing in UI
- **Solution:** Check event-indexer is running and not errored
- **Solution:** Verify MCFUN_FACTORY_ADDRESS environment variable is correct
- **Solution:** Trigger manual indexing via edge function

**Issue:** Price charts not updating
- **Solution:** Check price-snapshot cron job is running
- **Solution:** Verify database has recent entries in `price_snapshots` table
- **Solution:** Check for RPC rate limiting

### Edge Function Debugging

View logs in Supabase Dashboard → Edge Functions → Logs

Check environment variables are set:
```sql
-- Run in Supabase SQL Editor (won't show env vars, but can test edge function)
SELECT * FROM indexer_state ORDER BY updated_at DESC LIMIT 1;
```

### Contract Interaction (Fallback)

If frontend is down, users can interact directly via Etherscan:
- Factory: https://etherscan.io/address/0x6E8717dd111Bea3f5B12785798F3d1380c01D72B#writeContract
- Locker: https://etherscan.io/address/0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38#writeContract

---

## Upgrade Path (Future)

Since contracts are immutable, any protocol upgrades require:
1. Deploy new factory + locker contracts
2. Update frontend to point to new addresses
3. Migrate indexing to include both old and new contracts
4. Communicate migration to users

Old tokens remain on old contracts and continue to function.

---

## Contact and Governance

**Fee Recipient Multisig:** `0x993AEe79ee816B636D80f06186325b19a0eE3D45`

This address controls all protocol fees and should be used for:
- Protocol revenue management
- Future development funding
- Emergency response coordination
- Community governance decisions

---

## Changelog

### 2026-01-27 - Initial Mainnet Deployment
- Deployed McFunFactory to mainnet
- Deployed TokenLocker to mainnet
- Updated fee recipient to multisig address
- Configured all environment variables
- Frontend configured for mainnet-first operation

---

**Status:** ✅ Production Ready
**Last Updated:** 2026-01-27
