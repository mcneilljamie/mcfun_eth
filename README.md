# McFun

A decentralized token launch platform on Ethereum that enables anyone to create and trade ERC-20 tokens with instant liquidity.

## Features

- **100% Safe**: LP tokens are permanently burned - liquidity cannot be removed
- **Low Cost**: Launch tokens for free (only gas costs, minimum 0.1 ETH)
- **Instant Trading**: Trade immediately after launch with 0.4% swap fee
- **Fair Launch**: Fixed supply of 1M tokens, 50-100% to liquidity pool
- **Multi-language**: Available in 17 languages

## Quick Start

```bash
git clone https://github.com/yourusername/mcfun.git
cd mcfun
npm install
```

Create `.env`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

```bash
npm run dev
```

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + ethers.js v6
- Supabase (database + edge functions)
- Custom ERC-20 + AMM contracts

## How It Works

1. **Launch**: Deploy ERC-20 token with 1M fixed supply
2. **Add Liquidity**: Deposit ETH + tokens to create AMM pool
3. **Burn LP Tokens**: Permanently lock liquidity (unruggable)
4. **Trade**: Instant swaps using constant product formula

## License

MIT

---

**Built by Jamie McNeill**
