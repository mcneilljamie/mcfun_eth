import { Rocket, Shield, DollarSign, Zap } from 'lucide-react';

interface HomeProps {
  onNavigate: (page: string) => void;
}

export function Home({ onNavigate }: HomeProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6">
            Launch Your Token
            <br />
            <span className="text-gray-600">Simple. Safe. Fair.</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            The easiest and cheapest way to launch tokens on Ethereum with built-in liquidity and unruggable security.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('launch')}
              className="bg-gray-900 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-800 transition-all transform hover:scale-105 shadow-lg"
            >
              Launch Token Now
            </button>
            <button
              onClick={() => onNavigate('tokens')}
              className="bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-50 transition-all transform hover:scale-105 shadow-lg border-2 border-gray-900"
            >
              Explore Tokens
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-shadow">
            <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-gray-900" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Lightning Fast</h3>
            <p className="text-gray-600">
              Launch your token in minutes with a simple, straightforward interface.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-shadow">
            <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-gray-900" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Unruggable</h3>
            <p className="text-gray-600">
              Initial liquidity is permanently burned, making your token truly secure.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-shadow">
            <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6 text-gray-900" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Token Creation Fees</h3>
            <p className="text-gray-600">
              Only pay gas fees. No hidden costs or platform charges.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-xl transition-shadow">
            <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Rocket className="w-6 h-6 text-gray-900" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Fair Launch</h3>
            <p className="text-gray-600">
              Fixed 1M token supply with customizable liquidity allocation.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-gray-900 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Create Token</h3>
              <p className="text-gray-600">
                Choose your token name, symbol, and how much liquidity to lock (minimum 25%).
              </p>
            </div>

            <div className="text-center">
              <div className="bg-gray-900 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Add Liquidity</h3>
              <p className="text-gray-600">
                Deposit at least 0.1 ETH to initialize your token's liquidity pool.
              </p>
            </div>

            <div className="text-center">
              <div className="bg-gray-900 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Start Trading</h3>
              <p className="text-gray-600">
                Your token is instantly tradable on our native DEX with a 0.4% swap fee.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-lg p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Why Choose McFun?</h2>
          <p className="text-lg text-gray-300 mb-6 max-w-3xl mx-auto">
            We've built the simplest, safest, and most cost-effective platform for launching tokens on Ethereum.
            No complex parameters, no hidden fees, no rug pulls. Just pure, fair token launches.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <div className="bg-white/10 backdrop-blur-sm px-6 py-3 rounded-lg">
              <div className="text-2xl font-bold">1M</div>
              <div className="text-sm text-gray-300">Fixed Supply</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm px-6 py-3 rounded-lg">
              <div className="text-2xl font-bold">0.1 ETH</div>
              <div className="text-sm text-gray-300">Min Liquidity</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm px-6 py-3 rounded-lg">
              <div className="text-2xl font-bold">0.4%</div>
              <div className="text-sm text-gray-300">Trading Fee</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
