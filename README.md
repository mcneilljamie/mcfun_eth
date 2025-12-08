# McFun

A decentralized token launch platform on Ethereum that enables anyone to create and trade ERC-20 tokens with instant liquidity.

## Overview

McFun is a fair launch platform inspired by pump.fun, designed for Ethereum. It allows users to:

- Launch new ERC-20 tokens with minimal friction
- Provide initial liquidity to automated market makers (AMM)
- Trade tokens instantly through an integrated DEX
- Track real-time prices with historical charts
- Monitor all swaps and transactions on-chain

## Key Features

### Secure & Fair
- **Unruggable**: LP tokens are burned at creation - liquidity cannot be removed
- **Immutable contracts**: No admin keys or upgrade mechanisms
- **Fair launch**: Transparent tokenomics with configurable allocations
- **Open source**: All code is publicly auditable

### Simple to Use
- **No listing fees**: Launch tokens for free (only gas costs)
- **Low barrier**: Minimum 0.1 ETH liquidity required
- **Instant trading**: Trade immediately after launch
- **Built-in visibility**: All tokens ranked by liquidity and volume

### Transparent Economics
- **Fixed supply**: 1,000,000 tokens per launch
- **Configurable allocation**: 50-100% to liquidity pool, remainder to creator
- **Trading fee**: 0.4% per swap
- **No hidden costs**: What you see is what you pay

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for blazing-fast development
- **Tailwind CSS** for styling
- **ethers.js v6** for Ethereum interaction
- **Lucide React** for icons
- **i18next** for internationalization (17 languages supported)

### Backend
- **Supabase** for database and real-time features
- **Supabase Edge Functions** (Deno) for:
  - Event indexing from blockchain
  - Price snapshot collection
  - CoinGecko ETH/USD price fetching

### Smart Contracts
- **ERC-20** token standard
- **Custom AMM** with bonding curve mechanics
- **Factory pattern** for token deployment

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- MetaMask or compatible Web3 wallet
- Ethereum RPC endpoint

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mcfun.git
cd mcfun
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file with:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:
```bash
npm run dev
```

### Database Setup

The project uses Supabase with the following tables:
- `tokens` - Stores launched token information
- `swaps` - Records all swap transactions
- `price_snapshots` - Tracks historical price data

Migrations are located in `supabase/migrations/`.

### Edge Functions

Deploy edge functions to Supabase:
- `event-indexer` - Indexes blockchain events (swaps, token creations)
- `price-snapshot` - Captures periodic price data for charts

## Usage

### Launching a Token

1. Connect your wallet
2. Navigate to the "Launch" page
3. Enter token details:
   - Name (e.g., "My Token")
   - Symbol (e.g., "MTK")
   - Website (optional)
   - Liquidity % (50-100%)
   - ETH amount (minimum 0.1)
4. Confirm transaction
5. Your token is live and tradeable!

### Trading

1. Browse tokens on the "Popular Tokens" page
2. Click on a token to view details
3. Enter ETH amount to swap
4. Confirm transaction
5. Receive tokens instantly

### Viewing Analytics

- **Price Charts**: Historical price data with accurate ETH/USD rates
- **Swap History**: View all trades for any token
- **Volume Tracking**: See 24h volume and total volume
- **Liquidity Stats**: Monitor ETH and token reserves

## How It Works

### 1. Token Creation
When you launch a token on McFun, we deploy a new ERC-20 token contract with a fixed supply of 1,000,000 tokens. You choose the token name, symbol, and what percentage of the supply to allocate to the initial liquidity pool (minimum 50%).

### 2. Automatic Liquidity Pool
Immediately after token creation, an Automated Market Maker (AMM) liquidity pool is created. You deposit ETH (minimum 0.1 ETH) alongside your allocated tokens to form the initial liquidity. Trading is enabled instantly using the constant product formula (x * y = k), similar to Uniswap V2.

### 3. Liquidity Burning
The liquidity pool tokens (LP tokens) that represent ownership of the pool are permanently burned by sending them to the zero address. This burns your deposited ETH and tokens in the pool forever, making your token unruggable - no one can ever remove the initial liquidity, not even you.

### 4. Trading Begins
Your token is immediately tradable on our platform. Every swap incurs a 0.4% fee that goes to the platform to maintain and improve the service. The remaining tokens (not allocated to liquidity) are sent directly to your wallet.

## Architecture

### Price Snapshot System

The platform uses a sophisticated price tracking system:
- Edge function fetches ETH/USD price from CoinGecko
- Stores historical ETH prices with each snapshot
- Charts render accurate historical USD values
- Current price updates in real-time (60s interval)

### Event Indexing

Blockchain events are indexed via edge functions:
- Listens for `TokenCreated` and `Swap` events
- Stores data in Supabase for fast queries
- Updates token reserves and volume metrics

## Project Structure

```
├── src/
│   ├── components/      # React components
│   ├── contracts/       # Contract ABIs and addresses
│   ├── i18n/           # Internationalization (17 languages)
│   ├── lib/            # Utilities and helpers
│   ├── pages/          # Page components
│   └── App.tsx         # Main app component
├── supabase/
│   ├── functions/      # Edge functions
│   └── migrations/     # Database migrations
└── public/             # Static assets
```

## Supported Languages

McFun is available in 17 languages:
- English
- Spanish
- French
- German
- Italian
- Portuguese
- Russian
- Japanese
- Korean
- Chinese
- Hindi
- Arabic
- Turkish
- Persian (Farsi)
- Vietnamese
- Indonesian
- Georgian

## Fee Structure

- **Token Launch**: $0 (only gas fees)
- **Trading**: 0.4% per swap
- **Platform Fee**: Goes to infrastructure and development

## Security Guarantees

- **Permanently Burned Liquidity**: LP tokens sent to zero address (0x000...000)
- **Immutable Contracts**: Cannot be modified, upgraded, or paused
- **Transparent Fees**: Fee recipient address is hardcoded and publicly visible
- **Open Source**: All contracts verifiable on Etherscan

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Roadmap

- [ ] Smart contract audits
- [ ] Mainnet deployment
- [ ] Advanced charting features
- [ ] Token comments and social features
- [ ] Multi-chain support
- [ ] Mobile app

## Support

For questions, issues, or suggestions:
- Open an issue on GitHub
- Join our community (add Discord/Telegram links)

## Disclaimer

This software is provided "as is" without warranty. Cryptocurrency trading carries risk. Always do your own research before investing.

---

**Founded and maintained by Jamie McNeill**

Built with love for the Ethereum community.
