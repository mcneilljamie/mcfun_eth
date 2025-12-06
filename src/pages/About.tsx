import { Shield, Lock, Coins, TrendingUp, Users, Zap, DollarSign, Check } from 'lucide-react';

export function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            About McFun
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            The simplest and safest way to launch tokens on Ethereum with built-in liquidity and unruggable security.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Zap className="w-8 h-8" />
            How McFun Works
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">1. Token Creation</h3>
              <p className="text-gray-700 leading-relaxed">
                When you launch a token on McFun, we deploy a new ERC-20 token contract with a fixed supply of 1,000,000 tokens.
                You choose the token name, symbol, and what percentage of the supply to allocate to the initial liquidity pool (minimum 25%).
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">2. Automatic Liquidity Pool</h3>
              <p className="text-gray-700 leading-relaxed">
                Immediately after token creation, an Automated Market Maker (AMM) liquidity pool is created. You deposit ETH (minimum 0.1 ETH)
                alongside your allocated tokens. This pool enables instant trading using the constant product formula (x * y = k),
                similar to Uniswap V2.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">3. Liquidity Burning</h3>
              <p className="text-gray-700 leading-relaxed">
                The liquidity pool tokens (LP tokens) that represent ownership of the pool are permanently burned by sending them to the
                zero address. This makes your token <span className="font-bold">unruggable</span> - no one can remove the initial liquidity,
                not even you.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">4. Trading Begins</h3>
              <p className="text-gray-700 leading-relaxed">
                Your token is immediately tradable on our platform. Every swap incurs a 0.4% fee that goes to the platform to maintain
                and improve the service. The remaining tokens (not allocated to liquidity) are sent directly to your wallet.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Shield className="w-8 h-8" />
            Why Choose McFun?
          </h2>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Truly Unruggable</h3>
                <p className="text-gray-600">
                  Initial liquidity is permanently burned. No one can remove it, making rug pulls impossible.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">No Presales or Insider Advantages</h3>
                <p className="text-gray-600">
                  Everyone trades at the same price from the AMM. Fair launch for all participants.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Simple & Straightforward</h3>
                <p className="text-gray-600">
                  No complex parameters or DeFi knowledge required. Launch in minutes.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Low Barrier to Entry</h3>
                <p className="text-gray-600">
                  Only 0.1 ETH minimum liquidity required. No platform fees to launch.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Instant Liquidity</h3>
                <p className="text-gray-600">
                  Your token is tradable immediately with built-in AMM functionality.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 mb-1">Transparent & On-Chain</h3>
                <p className="text-gray-600">
                  All contracts are verifiable on Etherscan. No hidden mechanisms.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <DollarSign className="w-8 h-8" />
            Fee Structure
          </h2>

          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg border-2 border-gray-200">
              <div className="flex items-start gap-4">
                <Coins className="w-8 h-8 text-gray-900 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Token Launch Fees</h3>
                  <div className="text-3xl font-bold text-green-600 mb-2">$0</div>
                  <p className="text-gray-700">
                    That's right - there are <span className="font-bold">no platform fees</span> to launch your token.
                    You only pay Ethereum network gas fees.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg border-2 border-gray-200">
              <div className="flex items-start gap-4">
                <TrendingUp className="w-8 h-8 text-gray-900 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Trading Fees</h3>
                  <div className="text-3xl font-bold text-gray-900 mb-2">0.4%</div>
                  <p className="text-gray-700">
                    Every token swap on our platform incurs a 0.4% fee. This fee goes to the platform to support infrastructure,
                    development, and ongoing improvements.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200">
              <div className="flex items-start gap-4">
                <Users className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Why This Model?</h3>
                  <p className="text-gray-700">
                    Unlike traditional DEXes that charge fees to liquidity providers (which can be removed), our 0.4% trading fee
                    ensures platform sustainability without impacting the security of your token. The burned liquidity remains permanent,
                    and the small trading fee enables us to provide a reliable, maintained platform for the community.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-lg p-8 text-white">
          <h2 className="text-3xl font-bold mb-4 flex items-center gap-3">
            <Lock className="w-8 h-8" />
            Security Guarantees
          </h2>

          <div className="space-y-4">
            <div className="flex gap-3">
              <Shield className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Permanently Burned Liquidity</p>
                <p className="text-gray-300">
                  LP tokens are sent to the zero address (0x000...000) immediately upon creation. This is verifiable on-chain
                  and cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Shield className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Immutable Contracts</p>
                <p className="text-gray-300">
                  Once deployed, token and AMM contracts cannot be modified, upgraded, or paused. What you see is what you get.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Shield className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Transparent Fee Recipient</p>
                <p className="text-gray-300">
                  The platform fee recipient address is hardcoded in the contract and publicly visible. No hidden fee switches or
                  backdoors.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Shield className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Open Source & Verifiable</p>
                <p className="text-gray-300">
                  All smart contracts can be viewed and verified on Etherscan. Audit the code yourself before using the platform.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <p className="text-gray-700 text-lg">
            McFun was founded and is maintained by <span className="font-bold text-gray-900">Jamie McNeill</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
