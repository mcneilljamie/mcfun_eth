import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X, Trophy } from 'lucide-react';
import { supabase, Token } from '../lib/supabase';
import { formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { useWeb3 } from '../lib/web3';
import { DEFAULT_CHAIN_ID } from '../contracts/addresses';

interface TokenSelectorProps {
  selectedToken: Token | null;
  onSelectToken: (token: Token) => void;
  disabled?: boolean;
}

export function TokenSelector({ selectedToken, onSelectToken, disabled = false }: TokenSelectorProps) {
  const { chainId } = useWeb3();
  const activeChainId = chainId || DEFAULT_CHAIN_ID;

  const [isOpen, setIsOpen] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadEthPrice();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTokens();
      loadEthPrice();
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    let result = tokens;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = tokens.filter(
        (token) =>
          token.name.toLowerCase().includes(query) ||
          token.symbol.toLowerCase().includes(query) ||
          token.token_address.toLowerCase().includes(query)
      );
    }

    const sorted = [...result].sort((a, b) => {
      const aMarketCap = calculateMarketCap(a);
      const bMarketCap = calculateMarketCap(b);
      return bMarketCap - aMarketCap;
    });

    setFilteredTokens(sorted);
  }, [searchQuery, tokens, ethPriceUSD]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const loadTokens = async () => {
    setIsLoading(true);

    try {
      const { data, error} = await supabase
        .from('tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data) {
        setTokens(data);
        setFilteredTokens(data);
      }
    } catch (err) {
      console.error('Failed to load tokens:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateTokenPriceUSD = (token: Token): number => {
    const ethReserve = parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
    const tokenReserve = parseFloat(token.current_token_reserve?.toString() || '1000000');

    if (tokenReserve === 0) return 0;

    const priceInEth = ethReserve / tokenReserve;
    return priceInEth * ethPriceUSD;
  };

  const calculateMarketCap = (token: Token): number => {
    const TOKEN_TOTAL_SUPPLY = 1000000;
    const priceUSD = calculateTokenPriceUSD(token);
    return priceUSD * TOKEN_TOTAL_SUPPLY;
  };

  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-gray-800"
      >
        {selectedToken ? (
          <div className="flex items-center space-x-3">
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{selectedToken.symbol}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{selectedToken.name}</span>
            </div>
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">Select a token</span>
        )}
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-[400px] flex flex-col">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by name, symbol, or address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600 focus:border-transparent text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {searchQuery ? 'No tokens found matching your search' : 'No tokens available'}
                </p>
              </div>
            ) : (
              <div className="py-2">
                {!searchQuery && (
                  <div className="px-3 py-2">
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Popular Tokens</h3>
                  </div>
                )}
                {filteredTokens.map((token, index) => (
                  <button
                    key={token.id}
                    onClick={() => handleSelectToken(token)}
                    className={`w-full px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left flex items-center justify-between group ${
                      selectedToken?.token_address === token.token_address ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {!searchQuery && index < 3 && (
                        <Trophy
                          className={`w-4 h-4 flex-shrink-0 ${
                            index === 0
                              ? 'text-yellow-500'
                              : index === 1
                              ? 'text-gray-400'
                              : 'text-amber-700'
                          }`}
                        />
                      )}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{token.symbol}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{token.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-400 font-mono truncate">{token.token_address.slice(0, 10)}...{token.token_address.slice(-8)}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                            {token.chain_id === 1 ? 'ETH' : token.chain_id === 8453 ? 'Base' : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0 ml-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        {formatUSD(calculateMarketCap(token), true)}
                      </span>
                      <span className="text-xs text-gray-400">market cap</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
