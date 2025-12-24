# On-Chain Data Refactoring Summary

This document summarizes the architectural changes made to ensure the frontend uses on-chain data as the source of truth, with the indexer treated as best-effort historical data only.

## Core Principle

**All real-time state (balances, prices, lock status, transaction success) now comes directly from on-chain reads or transaction receipts. The indexer is used only for delayed, best-effort history and metadata enrichment.**

## New Hooks Created

### 1. `useOnChainLocks` (`src/hooks/useOnChainLocks.ts`)
- **Purpose**: Query user's token locks directly from the TokenLocker contract
- **Source of Truth**: On-chain contract calls to `getLock()` for each lock ID
- **Returns**: Array of locks with owner, token address, amount, unlock time, and withdrawn status
- **Refresh**: Can be manually triggered via `reload()` function
- **Independence**: Works completely independently of the indexer

### 2. `useTokenBalance` (`src/hooks/useTokenBalance.ts`)
- **Purpose**: Query ERC20 token balance for a user
- **Source of Truth**: Direct ERC20 `balanceOf()` contract call
- **Auto-refresh**: Configurable refresh interval (default 10 seconds)
- **Independence**: No indexer dependency

### 3. `useLiveReserves` (`src/hooks/useLiveReserves.ts`)
- **Purpose**: Query AMM reserves for price calculations
- **Source of Truth**: Direct AMM contract calls to `reserveETH()` and `reserveToken()`
- **Auto-refresh**: Configurable refresh interval (default 10 seconds)
- **Independence**: No indexer dependency

## Pages Refactored

### MyLocks Page (`src/pages/MyLocks.tsx`)

**Before:**
- Relied on `get_user_locked_tokens` RPC function from Supabase
- Lock status came from indexer database
- UI would be incorrect if indexer was delayed

**After:**
- Uses `useOnChainLocks` hook as primary data source
- Lock status (withdrawn, unlockable) determined from on-chain data
- After withdrawal transaction, immediately reloads from chain via `reload()`
- Indexer data only used for:
  - Transaction hashes (lock and withdraw tx hashes) - non-critical metadata
  - Lock timestamps - used for display only, fallback calculated if missing
- Prices calculated from live on-chain reserves
- **Result**: UI always shows correct lock status even if indexer is offline or delayed

### Portfolio Page (`src/pages/Portfolio.tsx`)

**Before:**
- Used `get_user_locked_tokens` RPC for locked token balances
- Locked value calculations depended on indexer

**After:**
- Queries all locks directly from TokenLocker contract
- Filters user's locks by comparing owner address
- Calculates locked token values using live on-chain reserves
- Groups locks by token address and aggregates on the fly
- Indexer only used to find AMM addresses for tokens (fallback gracefully if missing)
- **Result**: Locked token values always accurate and up-to-date from chain

### Trade Page (`src/pages/Trade.tsx`)

**Status:** Already mostly correct
- Already reads reserves and balances from chain
- After swap, immediately calls `loadReserves()` and `loadBalances()`
- Triggers indexer in background (non-blocking)
- Transaction success determined from receipt, not indexer confirmation

## Transaction Flow Improvements

### Token Withdrawal Flow
1. User clicks "Withdraw" on unlockable lock
2. Check on-chain state via `getLock()` to verify not already withdrawn
3. Submit `unlockTokens()` transaction
4. Wait for transaction receipt
5. **Immediately reload on-chain locks** via `reload()`
6. Trigger indexer in background (non-blocking) for history updates
7. UI updates from fresh on-chain data, not indexer

### Token Swap Flow
1. User submits swap
2. Wait for transaction receipt
3. **Immediately read new balances and reserves from chain**
4. Update UI with fresh on-chain data
5. Trigger indexer in background (non-blocking)
6. Show success based on receipt, not indexer

### Token Launch Flow
1. User creates token
2. Extract token/AMM addresses from transaction receipt events
3. Immediately insert into database with data from transaction
4. UI can navigate to token detail page immediately
5. Background indexer catches up later

## Data Hierarchy

### Critical Real-Time Data (Always from Chain)
- ✅ Token balances (ERC20 `balanceOf`)
- ✅ ETH balances (`provider.getBalance`)
- ✅ AMM reserves (`reserveETH`, `reserveToken`)
- ✅ Lock status (withdrawn, unlockable) from `getLock`
- ✅ Lock amounts and unlock times from `getLock`
- ✅ Current prices (calculated from live reserves)

### Historical/Metadata (From Indexer, Non-Critical)
- 📊 24-hour price changes
- 📊 Historical charts and trends
- 📊 Transaction history and timestamps
- 📊 Volume statistics
- 📊 Lock creation timestamps
- 📊 Transaction hashes for explorer links

### Fallback Behavior
When indexer data is unavailable:
- UI shows live data from chain
- Historical data shows as unavailable or uses fallbacks
- Core functionality (view locks, withdraw, trade) works perfectly
- Transaction links may not be available but operations still work

## Performance Considerations

### Batching
- Lock queries batch multiple calls efficiently
- AMM reserve calls grouped per token
- Token info queries parallelized

### Caching
- Live reserves cached for 10-15 seconds
- ETH price cached for 60 seconds
- Lock data reloaded on-demand via manual `reload()` calls

### Optimization Opportunities (Future)
- Implement multicall pattern for batched contract reads
- Add React Query for better caching and deduplication
- Implement pagination for users with many locks

## Error Handling

### On-Chain Read Failures
- Show error states clearly
- Distinguish between chain RPC errors and indexer errors
- Provide retry mechanisms

### Indexer Unavailable
- Core functionality continues to work
- UI shows indicator that historical data may be incomplete
- No blocking errors

## Testing Scenarios

### Verify Correctness
1. ✅ Withdraw lock → UI updates immediately without waiting for indexer
2. ✅ Swap tokens → Balances update immediately from chain
3. ✅ Disconnect from Supabase → Portfolio still shows live balances
4. ✅ Indexer delayed → Lock status still correct from chain
5. ✅ Multiple tabs → All tabs see fresh data after transaction

## Migration Impact

### Breaking Changes
- None - Indexer continues to run and provide historical data
- Backward compatible with existing functionality

### Improved UX
- ✅ Faster UI updates after transactions
- ✅ No waiting for indexer to confirm state changes
- ✅ Accurate data even during indexer delays
- ✅ Works offline from indexer (with reduced features)

## Future Enhancements

### Short Term
- Add loading indicators that differentiate chain reads vs indexer queries
- Show "historical data loading" vs "real-time data loading" states
- Add retry logic for failed on-chain reads

### Long Term
- Implement multicall for batch contract reads
- Add service worker caching for recent on-chain reads
- Implement optimistic UI updates with on-chain verification
- Add WebSocket subscriptions to contract events for instant updates

## Summary

The frontend now treats the blockchain as the single source of truth for all critical state. Users see immediate, accurate data after every transaction. The indexer serves its proper role as a historical data enrichment service that enhances UX with charts and trends but never blocks core functionality. This architecture makes the app resilient to indexer delays, offline periods, or data inconsistencies.
