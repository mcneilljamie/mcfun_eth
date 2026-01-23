import { useState, useEffect, useMemo } from 'react';
import { Trophy, Search, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { JsonRpcProvider } from 'ethers';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatTimeAgo, formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { useWeb3 } from '../lib/web3';
import { ToastMessage } from '../App';
import { DEFAULT_CHAIN_ID } from '../contracts/addresses';

interface TokensProps {
  onSelectToken: (token: Token) => void;
  onViewToken: (tokenAddress: string) => void;
  onShowToast: (toast: ToastMessage) => void;
}

interface TokenEnrichedData {
  currentPriceUSD: number;
  marketCap: number;
  priceChange: number | null;
  isNew: boolean;
  liquidityETH: string;
}

export function Tokens({ onSelectToken, onViewToken }: TokensProps) {
  const { t } = useTranslation();
  const { provider } = useWeb3();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [tokenDataMap, setTokenDataMap] = useState<Record<string, TokenEnrichedData>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [sortBy, setSortBy] = useState<'marketCap' | 'liquidity' | 'age-newest' | 'age-oldest'>(() => {
    const saved = localStorage.getItem('mcfun_tokens_sort_preference');
    if (saved && ['marketCap', 'liquidity', 'age-newest', 'age-oldest'].includes(saved)) {
      return saved as 'marketCap' | 'liquidity' | 'age-newest' | 'age-oldest';
    }
    return 'marketCap';
  });

  const readOnlyProvider = useMemo(() => {
    const rpcUrl = DEFAULT_CHAIN_ID === 11155111
      ? import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
      : import.meta.env.VITE_MAINNET_RPC_URL || 'https://eth.llamarpc.com';
    return new JsonRpcProvider(rpcUrl);
  }, []);

  useEffect(() => {
    loadTokens();
    loadEthPrice();

    const ethPriceInterval = setInterval(loadEthPrice, 60000);

    let lastTokenUpdate = Date.now();
    const tokensSubscription = supabase
      .channel('tokens-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => {
        const now = Date.now();
        if (now - lastTokenUpdate >= 5000) {
          lastTokenUpdate = now;
          loadTokens();
        }
      })
      .subscribe();

    // Subscribe to price snapshot updates for real-time price changes
    let lastPriceUpdate = Date.now();
    const priceSubscription = supabase
      .channel('price-snapshots-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_snapshots' }, (payload) => {
        const now = Date.now();
        if (now - lastPriceUpdate >= 2000) {
          lastPriceUpdate = now;
          // Force update by setting isUpdating to false first
          setIsUpdating(false);
          setTimeout(() => loadTokenData(), 100);
        }
      })
      .subscribe();

    return () => {
      clearInterval(ethPriceInterval);
      tokensSubscription.unsubscribe();
      priceSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('mcfun_tokens_sort_preference', sortBy);
  }, [sortBy]);

  useEffect(() => {
    const activeProvider = provider || readOnlyProvider;

    if (filteredTokens.length > 0 && activeProvider && ethPriceUSD > 0) {
      loadTokenData();
      const dataInterval = setInterval(loadTokenData, 30000);

      let lastBlockUpdate = Date.now();
      const blockListener = () => {
        const now = Date.now();
        if (now - lastBlockUpdate >= 30000) {
          lastBlockUpdate = now;
          loadTokenData();
        }
      };

      activeProvider.on('block', blockListener);

      return () => {
        clearInterval(dataInterval);
        activeProvider.off('block', blockListener);
      };
    }
  }, [filteredTokens, provider, readOnlyProvider, ethPriceUSD]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

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
      const aData = tokenDataMap[a.token_address];
      const bData = tokenDataMap[b.token_address];

      if (sortBy === 'marketCap') {
        const aMarketCap = aData?.marketCap || 0;
        const bMarketCap = bData?.marketCap || 0;
        return bMarketCap - aMarketCap;
      } else if (sortBy === 'liquidity') {
        const aLiquidity = parseFloat(aData?.liquidityETH || '0');
        const bLiquidity = parseFloat(bData?.liquidityETH || '0');
        return bLiquidity - aLiquidity;
      } else if (sortBy === 'age-newest') {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      } else {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return aTime - bTime;
      }
    });

    setFilteredTokens(sorted);
  }, [searchQuery, tokens, tokenDataMap, sortBy]);

  const loadTokens = async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error loading tokens:', error);
        setIsLoading(false);
        return;
      }

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

  const loadTokenData = async () => {
    const activeProvider = provider || readOnlyProvider;
    if (!activeProvider || filteredTokens.length === 0 || ethPriceUSD === 0 || isUpdating) return;

    setIsUpdating(true);

    try {
      // Load data for all filtered tokens
      const visibleTokens = filteredTokens;

      // Fetch latest prices from database for all visible tokens
      // We need to get the most recent snapshot for each token individually
      const priceMap = new Map<string, { price_usd: number; eth_reserve: string; token_reserve: string }>();

      await Promise.all(
        visibleTokens.map(async (token) => {
          const { data: latestSnapshot } = await supabase
            .from('price_snapshots')
            .select('price_eth, eth_price_usd, eth_reserve, token_reserve')
            .eq('token_address', token.token_address.toLowerCase())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestSnapshot) {
            const priceEth = parseFloat(latestSnapshot.price_eth || '0');
            const ethPriceUsd = parseFloat(latestSnapshot.eth_price_usd || '0');
            const priceUsd = priceEth * ethPriceUsd;

            priceMap.set(token.token_address, {
              price_usd: priceUsd,
              eth_reserve: latestSnapshot.eth_reserve?.toString() || '0',
              token_reserve: latestSnapshot.token_reserve?.toString() || '0'
            });
          }
        })
      );

      const newTokenData: Record<string, TokenEnrichedData> = { ...tokenDataMap };

      for (const token of visibleTokens) {
        const dbPrice = priceMap.get(token.token_address);

        // Always use the latest snapshot price (same source as TokenDetail page)
        const currentPriceUSD = dbPrice && dbPrice.price_usd > 0
          ? dbPrice.price_usd
          : (() => {
              // Fallback only if no snapshot exists
              const ethReserve = parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
              const tokenReserve = parseFloat(token.current_token_reserve?.toString() || '1000000');
              if (tokenReserve === 0 || isNaN(ethReserve) || isNaN(tokenReserve)) return 0;
              const priceInEth = ethReserve / tokenReserve;
              return priceInEth * ethPriceUSD;
            })();
        const TOKEN_TOTAL_SUPPLY = 1000000;
        const marketCap = currentPriceUSD * TOKEN_TOTAL_SUPPLY;

        // Use database reserves for liquidity
        const liquidityETH = dbPrice?.eth_reserve || token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString();

        const now = Date.now();
        const createdAt = new Date(token.created_at);
        const twentyFourHoursAgoTime = new Date(now - 24 * 60 * 60 * 1000);
        const isNew = createdAt > twentyFourHoursAgoTime;

        let priceChange: number | null = null;

        const totalVolume = parseFloat(token.total_volume_eth || '0');

        // Check if there have been trades in the last 24 hours
        const lastSwapAt = token.last_swap_at ? new Date(token.last_swap_at) : null;
        const hasRecentTrades = lastSwapAt && (now - lastSwapAt.getTime() < 24 * 60 * 60 * 1000);

        // Only show price change if there has been recent trading activity
        if (hasRecentTrades) {
          // For new tokens: calculate from live blockchain data (most accurate)
          // For older tokens: trust database's 24h calculation (prevents flickering)
          if (isNew && token.launch_price_eth && token.launch_eth_price_usd) {
            const launchPriceUSD = parseFloat(token.launch_price_eth) * parseFloat(token.launch_eth_price_usd);
            if (launchPriceUSD > 0 && currentPriceUSD > 0) {
              priceChange = ((currentPriceUSD - launchPriceUSD) / launchPriceUSD) * 100;
            }
          } else if (token.price_change_24h && Math.abs(parseFloat(token.price_change_24h)) > 0.01) {
            priceChange = parseFloat(token.price_change_24h);
          }
        }

        newTokenData[token.token_address] = {
          currentPriceUSD,
          marketCap,
          priceChange,
          isNew,
          liquidityETH
        };
      }

      setTokenDataMap(newTokenData);
    } catch (err) {
      console.error('Failed to load token data:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="bg-gray-900 p-2 rounded-lg">
                  <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('tokens.title')}</h1>
              </div>

              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('tokens.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">{t('tokens.rankBy')}:</span>
              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 flex-wrap">
                <button
                  onClick={() => setSortBy('marketCap')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    sortBy === 'marketCap'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {t('tokens.marketCap')}
                </button>
                <button
                  onClick={() => setSortBy('liquidity')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    sortBy === 'liquidity'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {t('tokens.liquidity')}
                </button>
                <button
                  onClick={() => setSortBy('age-newest')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    sortBy === 'age-newest'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {t('tokens.ageNewest')}
                </button>
                <button
                  onClick={() => setSortBy('age-oldest')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                    sortBy === 'age-oldest'
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {t('tokens.ageOldest')}
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600">{t('tokens.loading')}</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">
                {searchQuery ? t('tokens.noResults') : t('tokens.noTokens')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.rank')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.token')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.price')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.priceChange')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.marketCap')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.liquidity')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.created')}</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">{t('tokens.table.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map((token, index) => {
                      const tokenData = tokenDataMap[token.token_address];
                      return (
                      <tr
                        key={token.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => onViewToken(token.token_address)}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center space-x-2">
                            {index < 3 && (
                              <Trophy
                                className={`w-4 h-4 ${
                                  index === 0
                                    ? 'text-yellow-500'
                                    : index === 1
                                    ? 'text-gray-400'
                                    : 'text-amber-700'
                                }`}
                              />
                            )}
                            <span className="font-medium text-gray-900">{index + 1}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 break-words">{token.name}</div>
                            <div className="text-sm text-gray-500 whitespace-nowrap">{token.symbol}</div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {tokenData ? formatUSD(tokenData.currentPriceUSD, false) : '–'}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {tokenData ? (
                            <div>
                              <div className={`font-semibold ${
                                tokenData.priceChange === null || tokenData.priceChange === 0
                                  ? 'text-gray-500'
                                  : tokenData.priceChange > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                {tokenData.priceChange === null || tokenData.priceChange === 0 ? '–' : `${tokenData.priceChange >= 0 ? '+' : ''}${tokenData.priceChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {tokenData.isNew ? t('tokens.table.sinceLaunch') : t('tokens.table.24h')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">–</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {tokenData ? formatUSD(tokenData.marketCap, true) : '–'}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {tokenData ? formatCurrency(tokenData.liquidityETH) : '–'}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="text-sm text-gray-600">
                            {formatTimeAgo(token.created_at)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectToken(token);
                            }}
                            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center space-x-2"
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>{t('tokens.table.trade')}</span>
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {filteredTokens.map((token, index) => {
                  const tokenData = tokenDataMap[token.token_address];
                  return (
                  <div
                    key={token.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200 cursor-pointer hover:border-gray-300 transition-colors"
                    onClick={() => onViewToken(token.token_address)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {index < 3 && (
                          <Trophy
                            className={`w-4 h-4 ${
                              index === 0
                                ? 'text-yellow-500'
                                : index === 1
                                ? 'text-gray-400'
                                : 'text-amber-700'
                            }`}
                          />
                        )}
                        <span className="font-medium text-gray-500 text-sm">#{index + 1}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectToken(token);
                        }}
                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center space-x-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        <span>{t('tokens.table.trade')}</span>
                      </button>
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-gray-900 text-lg break-words">{token.name}</div>
                      <div className="text-sm text-gray-500 whitespace-nowrap">{token.symbol}</div>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.price')}:</span>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {tokenData ? formatUSD(tokenData.currentPriceUSD, false) : '–'}
                          </div>
                          {tokenData && (
                            <div className="flex items-center justify-end gap-1">
                              <span className={`text-xs font-medium ${
                                tokenData.priceChange === null || tokenData.priceChange === 0
                                  ? 'text-gray-500'
                                  : tokenData.priceChange > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                {tokenData.priceChange === null || tokenData.priceChange === 0 ? '–' : `${tokenData.priceChange >= 0 ? '+' : ''}${tokenData.priceChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                              </span>
                              <span className="text-xs text-gray-500">
                                {tokenData.isNew ? t('tokens.table.launch') : t('tokens.table.24h')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.marketCap')}:</span>
                        <span className="font-semibold text-gray-900">
                          {tokenData ? formatUSD(tokenData.marketCap, true) : '–'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.liquidity')}:</span>
                        <span className="font-semibold text-gray-900">
                          {tokenData ? formatCurrency(tokenData.liquidityETH) : '–'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.created')}:</span>
                        <span className="text-sm text-gray-900">
                          {formatTimeAgo(token.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}

          {!isLoading && filteredTokens.length > 0 && (
            <div className="mt-6">
              <div className="text-sm text-gray-500 text-center">
                Showing all {filteredTokens.length} tokens
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
