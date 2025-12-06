import { useWeb3 } from '../lib/web3';
import { formatAddress } from '../lib/utils';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export function Navigation({ currentPage, onNavigate }: NavigationProps) {
  const { account, connect, disconnect, isConnecting } = useWeb3();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <button
              onClick={() => onNavigate('home')}
              className="flex items-center space-x-2 text-gray-900 font-bold text-lg sm:text-xl hover:text-gray-700 transition-colors"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-base sm:text-lg">
                MF
              </div>
              <span className="hidden xs:inline">McFun</span>
            </button>

            <div className="hidden md:flex space-x-1">
              <button
                onClick={() => onNavigate('launch')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'launch'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Launch Token
              </button>
              <button
                onClick={() => onNavigate('trade')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'trade'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Trade
              </button>
              <button
                onClick={() => onNavigate('tokens')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'tokens'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Popular Tokens
              </button>
              <button
                onClick={() => onNavigate('about')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentPage === 'about'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                About
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {account ? (
              <button
                onClick={disconnect}
                className="bg-gray-900 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium hover:bg-gray-800 transition-colors"
              >
                {formatAddress(account)}
              </button>
            ) : (
              <button
                onClick={connect}
                disabled={isConnecting}
                className="bg-gray-900 text-white px-4 sm:px-6 py-2 rounded-lg text-sm sm:text-base font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
                <span className="sm:hidden">{isConnecting ? 'Connecting...' : 'Connect'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="md:hidden flex space-x-1 pb-3">
          <button
            onClick={() => onNavigate('launch')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'launch'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Launch
          </button>
          <button
            onClick={() => onNavigate('trade')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'trade'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Trade
          </button>
          <button
            onClick={() => onNavigate('tokens')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'tokens'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => onNavigate('about')}
            className={`flex-1 px-2 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
              currentPage === 'about'
                ? 'bg-gray-900 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            About
          </button>
        </div>
      </div>
    </nav>
  );
}
