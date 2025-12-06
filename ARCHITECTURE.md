# JAMM Technical Architecture

## System Overview

JAMM is a decentralized token launch platform built on Ethereum with the following components:

1. **Smart Contracts** - On-chain logic for token creation, AMM, and trading
2. **Frontend Application** - React-based user interface
3. **Database** - Supabase for storing token metadata and price history
4. **Web3 Integration** - ethers.js for blockchain interactions

## Smart Contract Architecture

### JammFactory Contract

The factory contract handles token creation and initial liquidity setup.

**Key Functions:**
- `createToken(name, symbol, liquidityPercent)` - Creates a new token and AMM pair
  - Deploys new ERC20 token with 1M supply
  - Deploys new AMM contract for the token
  - Adds initial liquidity to AMM
  - Burns LP tokens to lock liquidity permanently
  - Emits `TokenLaunched` event

**Token Distribution:**
- User specifies liquidity percentage (25-100%)
- Liquidity tokens are sent to AMM and LP tokens burned
- Remaining tokens sent to creator's wallet

**Security Features:**
- Minimum 0.1 ETH liquidity requirement
- Minimum 25% liquidity allocation
- LP tokens automatically burned (sent to dead address)
- No upgrade mechanisms or admin controls

### JammAMM Contract

Each token gets its own AMM contract implementing the constant product (xy=k) formula.

**Key Functions:**
- `addLiquidity(tokenAmount)` - Add liquidity to pool (payable)
- `removeLiquidity(liquidityAmount)` - Remove liquidity from pool
- `swapETHForToken(minTokenOut)` - Swap ETH for tokens (payable)
- `swapTokenForETH(tokenIn, minETHOut)` - Swap tokens for ETH
- `getPrice()` - Get current token price in ETH
- `getTokenOut(ethIn)` - Get quote for ETH->Token swap
- `getETHOut(tokenIn)` - Get quote for Token->ETH swap

**Pricing Formula:**
```
Token Price = reserveETH / reserveToken

For swaps:
amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)

With 0.4% fee deducted from amountIn
```

**Fee Structure:**
- 0.4% fee on every swap
- Fees sent to `0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc`
- Fee calculated before swap execution

### JammToken Contract

Standard ERC20 implementation with:
- Fixed supply: 1,000,000 tokens
- 18 decimals
- No mint/burn functions
- No pause/blacklist features
- Clean, minimal implementation

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── Navigation.tsx      # Main navigation bar
│   └── PriceChart.tsx      # SVG-based price chart
├── pages/
│   ├── Home.tsx           # Landing page
│   ├── Launch.tsx         # Token creation form
│   ├── Trade.tsx          # DEX trading interface
│   └── Tokens.tsx         # Popular tokens list
├── lib/
│   ├── web3.tsx           # Web3 context and hooks
│   ├── contracts.ts       # Contract interaction functions
│   ├── supabase.ts        # Database client and types
│   └── utils.ts           # Utility functions
└── contracts/
    ├── abis.ts            # Contract ABIs
    └── addresses.ts       # Deployed contract addresses
```

### State Management

The application uses React Context for Web3 state:
- Wallet connection status
- Connected account address
- Provider and signer instances
- Network information

Page-level state managed with React hooks:
- Token selection
- Form inputs
- Transaction status
- Loading states

### Web3 Integration

**Wallet Connection:**
- Supports MetaMask and other injected wallets
- Auto-reconnect on page refresh
- Network change detection
- Account change handling

**Contract Interactions:**
```typescript
// Read operations (no gas)
- getAMMReserves()
- getPrice()
- getQuote()
- getTokenBalance()

// Write operations (requires signature)
- createToken()
- swapTokens()
```

**Transaction Flow:**
1. User initiates action
2. Frontend validates inputs
3. Gas estimation performed
4. User signs transaction
5. Transaction submitted to network
6. Frontend polls for confirmation
7. Success/error message displayed
8. UI updated with new data

## Database Schema

### Tables

**tokens**
- Stores all launched tokens
- Updated when new tokens are created
- Indexed by token_address and liquidity

**swaps**
- Records all swap transactions
- Used for volume calculations
- Used for price history

**price_snapshots**
- Periodic price captures
- Powers price charts
- Indexed by token_address and timestamp

### Data Flow

1. **Token Launch:**
   - User submits transaction
   - Event emitted from factory
   - Indexer catches event
   - Token data inserted into database

2. **Trading:**
   - User swaps tokens
   - Swap event emitted
   - Indexer records swap
   - Price snapshot created
   - Volume updated

3. **Price Charts:**
   - Frontend queries price_snapshots
   - Data filtered by timeframe
   - SVG chart rendered
   - Updates on new data

## Security Considerations

### Smart Contract Security

1. **No Upgrade Mechanism** - Contracts are immutable after deployment
2. **Reentrancy Protection** - Uses checks-effects-interactions pattern
3. **Integer Overflow** - Solidity 0.8+ has built-in overflow protection
4. **Access Control** - No admin functions, fully decentralized
5. **Liquidity Locking** - LP tokens burned, liquidity cannot be removed

### Frontend Security

1. **Input Validation** - All inputs validated before submission
2. **Slippage Protection** - Users set acceptable price slippage
3. **Gas Estimation** - Prevents failed transactions
4. **Error Handling** - Graceful handling of all error scenarios
5. **RLS Policies** - Database has row-level security enabled

### Known Limitations

1. **No MEV Protection** - Swaps vulnerable to front-running
2. **No Price Oracles** - Uses AMM spot price only
3. **No Governance** - No upgrade or parameter changes possible
4. **Single Pool Type** - Only xy=k AMM supported

## Performance Optimizations

### Frontend

- Lazy loading of components
- Debounced quote updates
- Optimistic UI updates
- Cached provider instances
- Minimal re-renders

### Smart Contracts

- Gas-optimized operations
- Minimal storage reads/writes
- Efficient event emission
- No unnecessary checks

### Database

- Indexed columns for fast queries
- Denormalized data where appropriate
- Connection pooling via Supabase
- Rate limiting on API endpoints

## Deployment Checklist

- [ ] Deploy JammFactory contract
- [ ] Verify contract on Etherscan
- [ ] Update factory address in frontend
- [ ] Deploy frontend to hosting
- [ ] Set up event indexer
- [ ] Set up price snapshot service
- [ ] Test token launch
- [ ] Test trading functionality
- [ ] Monitor for errors
- [ ] Set up alerts for critical events

## Future Enhancements

Potential improvements for v2:
- Multiple liquidity pools per token
- Advanced order types (limit, stop-loss)
- Liquidity mining rewards
- Governance token
- Cross-chain deployment
- Mobile app
- Advanced analytics
- Social features (comments, ratings)
