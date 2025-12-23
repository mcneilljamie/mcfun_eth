import { useState, useEffect } from 'react';
import { Trophy, Search, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatTimeAgo, formatUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { getAMMReserves } from '../lib/contracts';
import { useWeb3 } from '../lib/web3';
import { ToastMessage } from '../App';

interface TokensProps {
  onSelectToken: (token: Token) => void;
  onViewToken: (tokenAddress: string) => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function Tokens({ onSelectToken, onViewToken }: TokensProps) {
  const { t } = useTranslation();
  const { provider } = useWeb3();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [liveReserves, setLiveReserves] = useState<Record<string, { reserveETH: string; reserveToken: string }>>({});
  const [, setLiveVolumes] = useState<Record<string, string>>({});
  const [priceChanges, setPriceChanges] = useState<Record<string, { change: number; isNew: boolean }>>({});

  useEffect(() => {
    loadTokens();
    loadEthPrice();

    const interval = setInterval(loadEthPrice, 60000);

    const subscription = supabase
      .channel('tokens-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokens' }, () => {
        loadTokens();
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (tokens.length > 0) {
      loadLiveVolumes();
      loadPriceChanges();
      const dataInterval = setInterval(() => {
        loadLiveVolumes();
        loadPriceChanges();
      }, 10000);
      return () => clearInterval(dataInterval);
    }
  }, [tokens]);

  useEffect(() => {
    if (tokens.length > 0 && provider) {
      loadLiveReserves();
      const reservesInterval = setInterval(loadLiveReserves, 10000);
      return () => clearInterval(reservesInterval);
    }
  }, [tokens, provider]);

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
      const aMarketCap = calculateMarketCap(a);
      const bMarketCap = calculateMarketCap(b);
      return bMarketCap - aMarketCap;
    });

    setFilteredTokens(sorted);
  }, [searchQuery, tokens, liveReserves, ethPriceUSD]);

  const loadTokens = async () => {
    setIsLoading(true);

    try {
      // Index recent swaps in the background (non-blocking)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      fetch(`${supabaseUrl}/functions/v1/event-indexer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          indexTokenLaunches: false,
          indexSwaps: true
        }),
      }).catch(err => console.error('Failed to index swaps:', err));

      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .order('created_at', { ascending: false });

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

  const loadLiveReserves = async () => {
    if (!provider || tokens.length === 0) return;

    try {
      const reservesPromises = tokens.map(async (token) => {
        try {
          const reserves = await getAMMReserves(provider, token.amm_address);
          return {
            tokenAddress: token.token_address,
            reserves: {
              reserveETH: reserves.reserveETH,
              reserveToken: reserves.reserveToken,
            },
          };
        } catch (err) {
          console.error(`Failed to load reserves for ${token.symbol}:`, err);
          return null;
        }
      });

      const results = await Promise.all(reservesPromises);
      const newReserves: Record<string, { reserveETH: string; reserveToken: string }> = {};

      results.forEach((result) => {
        if (result) {
          newReserves[result.tokenAddress] = result.reserves;
        }
      });

      setLiveReserves(newReserves);
    } catch (err) {
      console.error('Failed to load live reserves:', err);
    }
  };

  const loadLiveVolumes = async () => {
    if (tokens.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('token_address, total_volume_eth')
        .in('token_address', tokens.map(t => t.token_address));

      if (error) throw error;

      const newVolumes: Record<string, string> = {};
      data?.forEach(token => {
        newVolumes[token.token_address] = token.total_volume_eth;
      });

      setLiveVolumes(newVolumes);
    } catch (err) {
      console.error('Failed to load live volumes:', err);
    }
  };

  const loadPriceChanges = async () => {
    if (tokens.length === 0) return;

    try {
      const { data, error } = await supabase
        .rpc('get_24h_price_changes', {
          p_token_addresses: tokens.map(t => t.token_address)
        });

      if (error) throw error;

      const newChanges: Record<string, { change: number; isNew: boolean }> = {};
      data?.forEach((item: any) => {
        if (item.price_change !== null) {
          newChanges[item.token_address] = {
            change: parseFloat(item.price_change),
            isNew: item.is_new
          };
        }
      });

      setPriceChanges(newChanges);
    } catch (err) {
      console.error('Failed to load price changes:', err);
    }
  };


  const calculateTokenPriceUSD = (token: Token): number => {
    const reserves = liveReserves[token.token_address];
    const ethReserve = reserves
      ? parseFloat(reserves.reserveETH)
      : parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
    const tokenReserve = reserves
      ? parseFloat(reserves.reserveToken)
      : parseFloat(token.current_token_reserve?.toString() || '1000000');

    if (tokenReserve === 0) return 0;

    const priceInEth = ethReserve / tokenReserve;
    return priceInEth * ethPriceUSD;
  };

  const calculateMarketCap = (token: Token): number => {
    const TOKEN_TOTAL_SUPPLY = 1000000;
    const priceUSD = calculateTokenPriceUSD(token);
    return priceUSD * TOKEN_TOTAL_SUPPLY;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
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
                    {filteredTokens.map((token, index) => (
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
                            {formatUSD(calculateTokenPriceUSD(token), false)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {priceChanges[token.token_address] !== undefined ? (
                            <div>
                              <div className={`font-semibold ${
                                priceChanges[token.token_address].change === 0
                                  ? 'text-gray-500'
                                  : priceChanges[token.token_address].change > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                {priceChanges[token.token_address].change >= 0 ? '+' : ''}{priceChanges[token.token_address].change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {priceChanges[token.token_address].isNew ? t('tokens.table.sinceLaunch') : t('tokens.table.24h')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {formatUSD(calculateMarketCap(token), true)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(liveReserves[token.token_address]?.reserveETH || token.current_eth_reserve || token.initial_liquidity_eth)}
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
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {filteredTokens.map((token, index) => (
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
                            {formatUSD(calculateTokenPriceUSD(token), false)}
                          </div>
                          {priceChanges[token.token_address] !== undefined && (
                            <div className="flex items-center justify-end gap-1">
                              <span className={`text-xs font-medium ${
                                priceChanges[token.token_address].change === 0
                                  ? 'text-gray-500'
                                  : priceChanges[token.token_address].change > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}>
                                {priceChanges[token.token_address].change >= 0 ? '+' : ''}{priceChanges[token.token_address].change.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                              </span>
                              <span className="text-xs text-gray-500">
                                {priceChanges[token.token_address].isNew ? t('tokens.table.launch') : t('tokens.table.24h')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.marketCap')}:</span>
                        <span className="font-semibold text-gray-900">
                          {formatUSD(calculateMarketCap(token), true)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{t('tokens.table.liquidity')}:</span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(liveReserves[token.token_address]?.reserveETH || token.current_eth_reserve || token.initial_liquidity_eth)}
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
                ))}
              </div>
            </>
          )}

          {!isLoading && filteredTokens.length > 0 && (
            <div className="mt-6 text-center text-sm text-gray-500">
              {t('tokens.showing', { count: filteredTokens.length })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
