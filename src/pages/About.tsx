import { useState, useEffect } from 'react';
import { Shield, Lock, Coins, TrendingUp, Users, Zap, DollarSign, Check, Eye, BarChart3, Wallet, Flame, ArrowLeftRight, Droplets, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatUSD, withTimeout } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';

interface PlatformStats {
  totalMarketCapUsd: number;
  totalVolumeEth: number;
  totalBurnedUsd: number;
  totalLockedUsd: number;
  tokenCount: number;
  ethereumCount: number;
  baseCount: number;
}

export function About() {
  const { t } = useTranslation();
  const [totalLiquidityUSD, setTotalLiquidityUSD] = useState<number>(0);
  const [ethereumLiquidityUSD, setEthereumLiquidityUSD] = useState<number>(0);
  const [baseLiquidityUSD, setBaseLiquidityUSD] = useState<number>(0);
  const [treasuryUSD, setTreasuryUSD] = useState<number | null>(null);

  const LAUNCH_DATE = new Date('2026-01-27T00:00:00Z');
  const daysLive = Math.floor((Date.now() - LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
  const [mcfunMarketCapPercent, setMcfunMarketCapPercent] = useState<number>(0);
  const [mcfunPriceUSD, setMcfunPriceUSD] = useState<number>(0);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!lastUpdated) return;

    const updateTimeAgo = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);

      if (diff < 60) {
        setTimeAgo(`${diff} ${diff === 1 ? 'second' : 'seconds'} ago`);
      } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        setTimeAgo(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`);
      } else {
        const hours = Math.floor(diff / 3600);
        setTimeAgo(`${hours} ${hours === 1 ? 'hour' : 'hours'} ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const loadData = async (isRetry = false) => {
    if (isRetry) setIsLoading(true);

    try {
      const ethPrice = await getEthPriceUSD();

      // Get the timestamp of the last ETH price update
      const { data: ethPriceData } = await withTimeout(
        supabase
          .from('eth_price_history')
          .select('timestamp')
          .order('timestamp', { ascending: false })
          .limit(1)
          .single(),
        10000,
        'ETH price history'
      );

      if (ethPriceData?.timestamp) {
        setLastUpdated(new Date(ethPriceData.timestamp));
      }

      // Load all tokens from ALL chains (Ethereum + Base)
      const { data: tokensData, error: tokensError } = await withTimeout(
        supabase
          .from('tokens')
          .select('token_address, current_eth_reserve, initial_liquidity_eth, current_token_reserve, price_change_24h, total_volume_eth, chain_id'),
        10000,
        'About page tokens'
      );

      if (tokensError) {
        console.error('Database error loading tokens:', tokensError);
        setLoadError(true);
      } else if (tokensData) {
        setLoadError(false);

        // Build a price lookup: token_address -> price_eth (from current reserves)
        const priceEthMap = new Map<string, number>();
        for (const token of tokensData) {
          const ethReserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
          const tokenReserve = parseFloat(token.current_token_reserve || '1000000');
          if (tokenReserve > 0 && ethReserve > 0) {
            priceEthMap.set(token.token_address.toLowerCase(), ethReserve / tokenReserve);
          }
        }

        // Fetch burn totals (amount burned + supply percentage) for all tokens
        const burnMap = new Map<string, { percent: number; amountBurned: number }>();
        if (tokensData.length > 0) {
          const { data: burnData } = await withTimeout(
            supabase
              .from('token_burn_totals')
              .select('token_address, percent_supply_burned, total_amount_burned')
              .in('token_address', tokensData.map(t => t.token_address.toLowerCase())),
            10000,
            'About page burn totals'
          );
          if (burnData) {
            for (const row of burnData) {
              burnMap.set(row.token_address.toLowerCase(), {
                percent: parseFloat(row.percent_supply_burned) || 0,
                amountBurned: parseFloat(row.total_amount_burned) || 0,
              });
            }
          }
        }

        // Fetch active (non-withdrawn) locks for all tokens
        const lockAmounts = new Map<string, number>();
        if (tokensData.length > 0) {
          const { data: lockData } = await withTimeout(
            supabase
              .from('token_locks')
              .select('token_address, amount_locked')
              .eq('is_withdrawn', false)
              .gt('amount_locked', 0)
              .in('token_address', tokensData.map(t => t.token_address.toLowerCase())),
            10000,
            'About page token locks'
          );
          if (lockData) {
            for (const row of lockData) {
              const addr = row.token_address.toLowerCase();
              lockAmounts.set(addr, (lockAmounts.get(addr) || 0) + (parseFloat(row.amount_locked) || 0));
            }
          }
        }

        // Calculate total liquidity (both sides of the pool)
        const totalEth = tokensData.reduce((sum, token) => {
          const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
          return sum + reserve;
        }, 0);

        const ethereumEth = tokensData
          .filter(token => token.chain_id === 1)
          .reduce((sum, token) => {
            const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
            return sum + reserve;
          }, 0);

        const baseEth = tokensData
          .filter(token => token.chain_id === 8453)
          .reduce((sum, token) => {
            const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
            return sum + reserve;
          }, 0);

        const totalLiqUSD = totalEth * ethPrice * 2;
        setTotalLiquidityUSD(totalLiqUSD);
        setEthereumLiquidityUSD(ethereumEth * ethPrice * 2);
        setBaseLiquidityUSD(baseEth * ethPrice * 2);

        // Calculate all three stats live from current data (matches DB function)
        const TOKEN_TOTAL_SUPPLY = 1000000;
        const WEI_DIVISOR = 1e18;
        let liveMarketCapUSD = 0;
        let liveBurnedUSD = 0;
        let liveLockedUSD = 0;
        let liveVolumeEth = 0;
        let mcfunMarketCapUSD = 0;
        let mcfunPriceUSDValue = 0;

        for (const token of tokensData) {
          const ethReserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
          const tokenReserve = parseFloat(token.current_token_reserve || '1000000');
          liveVolumeEth += parseFloat(token.total_volume_eth || '0');

          if (tokenReserve > 0 && ethReserve > 0) {
            const priceEth = ethReserve / tokenReserve;
            const addr = token.token_address.toLowerCase();
            const burnPercent = burnMap.get(addr)?.percent || 0;
            const amountBurned = burnMap.get(addr)?.amountBurned || 0;
            const totalLockedRaw = lockAmounts.get(addr) || 0;

            // Market cap: price_eth * circulating_supply * eth_price_usd
            const circulatingSupply = TOKEN_TOTAL_SUPPLY * (1 - burnPercent / 100);
            liveMarketCapUSD += priceEth * circulatingSupply * ethPrice;

            // Burned value: (amount_burned / 1e18) * price_eth * eth_price_usd
            if (amountBurned > 0) {
              liveBurnedUSD += (amountBurned / WEI_DIVISOR) * priceEth * ethPrice;
            }

            // Locked value: (amount_locked / 1e18) * price_eth * eth_price_usd
            if (totalLockedRaw > 0) {
              liveLockedUSD += (totalLockedRaw / WEI_DIVISOR) * priceEth * ethPrice;
            }

            if (addr === '0xe03e4d90a46f62ac405708ba5036f292d5e0edc8') {
              mcfunMarketCapUSD = priceEth * circulatingSupply * ethPrice;
              mcfunPriceUSDValue = priceEth * ethPrice;
            }
          }
        }

        const ethereumCount = tokensData.filter(t => t.chain_id === 1).length;
        const baseCount = tokensData.filter(t => t.chain_id === 8453).length;

        setPlatformStats({
          totalMarketCapUsd: liveMarketCapUSD,
          totalVolumeEth: liveVolumeEth,
          totalBurnedUsd: liveBurnedUSD,
          totalLockedUsd: liveLockedUSD,
          tokenCount: tokensData.length,
          ethereumCount,
          baseCount,
        });

        if (liveMarketCapUSD > 0 && mcfunMarketCapUSD > 0) {
          setMcfunMarketCapPercent((mcfunMarketCapUSD / liveMarketCapUSD) * 100);
        }
        if (mcfunPriceUSDValue > 0) {
          setMcfunPriceUSD(mcfunPriceUSDValue);
        }
      }
      // Fetch treasury ETH balance on Ethereum and Base
      const TREASURY = '0x993aee79ee816b636d80f06186325b19a0ee3d45';
      try {
        const ethRpc = 'https://ethereum.publicnode.com';
        const baseRpc = 'https://base.publicnode.com';
        const fetchBalance = async (rpc: string) => {
          const res = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [TREASURY, 'latest'], id: 1 }),
          });
          const json = await res.json();
          return parseInt(json.result, 16) / 1e18;
        };
        const [ethBal, baseBal] = await Promise.all([fetchBalance(ethRpc), fetchBalance(baseRpc)]);
        setTreasuryUSD((ethBal + baseBal) * ethPrice);
      } catch {
        // treasury fetch failure is non-critical
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2">
            {t('about.title')}
          </h1>
          <p className="text-base sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-4">
            {t('about.subtitle')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-green-200 dark:border-gray-700">
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('aboutPage.platformStats')}</h2>
            {timeAgo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Last updated {timeAgo}</p>
            )}
          </div>

          {loadError && !isLoading && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-amber-700 dark:text-amber-400">{t('tokens.staleData')}</span>
              <button
                onClick={() => loadData(true)}
                className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
              >
                {t('tokens.retry')}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{t('aboutPage.totalLiquidity')}</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {formatUSD(totalLiquidityUSD, true)}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('aboutPage.totalEthInPools')}</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{t('aboutPage.totalMarketCap')}</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {platformStats ? formatUSD(platformStats.totalMarketCapUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('aboutPage.combinedFDV')}</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ArrowLeftRight className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Tokens by Chain</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {platformStats && platformStats.tokenCount > 0
                    ? `${Math.round((platformStats.ethereumCount / platformStats.tokenCount) * 100)}% : ${Math.round((platformStats.baseCount / platformStats.tokenCount) * 100)}%`
                    : '0% : 0%'
                  }
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ethereum : Base</p>
            </div>

            <a href="/burn" className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Total Burned</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {platformStats ? formatUSD(platformStats.totalBurnedUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total value burned</p>
            </a>

            <a href="/token/0xe03e4d90a46f62ac405708ba5036f292d5e0edc8" className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">MCFUN Price</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {mcfunPriceUSD > 0 ? '$' + mcfunPriceUSD.toLocaleString('en-US', { minimumFractionDigits: mcfunPriceUSD >= 0.01 ? 2 : 6, maximumFractionDigits: mcfunPriceUSD >= 0.01 ? 2 : 6 }) : '$0.000000'}
                </div>
              )}
              <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 inline-block">Native platform token</span>
            </a>

            <a href="/lock" className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Total Locked</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {platformStats ? formatUSD(platformStats.totalLockedUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total value locked on McFun</p>
            </a>

            <a href="/tokens" className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{t('aboutPage.projectsListed')}</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {platformStats ? platformStats.tokenCount.toLocaleString() : '0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('aboutPage.totalProjects')}</p>
            </a>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Days Live</h3>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                {daysLive.toLocaleString()}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Established January 27th, 2026</p>
            </div>

            <a href="https://app.zerion.io/0x993AEe79ee816B636D80f06186325b19a0eE3D45/overview" target="_blank" rel="noopener noreferrer" className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">McFun ETH Treasury</h3>
              </div>
              {isLoading || treasuryUSD === null ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700 dark:text-green-400">
                  {'$' + treasuryUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">USD value of McFun's ETH Treasury</p>
            </a>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Zap className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.howWorks.title')}
          </h2>

          <div className="space-y-5 sm:space-y-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">{t('about.howWorks.step1.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('about.howWorks.step1.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">{t('about.howWorks.step2.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('about.howWorks.step2.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">{t('about.howWorks.step3.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('about.howWorks.step3.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">{t('about.howWorks.step4.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                {t('about.howWorks.step4.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.why.title')}
          </h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.unruggable.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.unruggable.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.permanentListings.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.permanentListings.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.portfolioTracking.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.portfolioTracking.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.freeTokenLocking.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.freeTokenLocking.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.easyBurning.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.easyBurning.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.extremeLowFees.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.extremeLowFees.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.simple.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.simple.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.lowBarrier.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.lowBarrier.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.instant.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.instant.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.why.transparent.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('about.why.transparent.description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-lg p-5 sm:p-8 text-white mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
            <Lock className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.security.title')}
          </h2>

          <div className="space-y-3 sm:space-y-4">
            <div className="flex gap-2.5 sm:gap-3">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm sm:text-base font-semibold mb-1">{t('about.security.burned.title')}</p>
                <p className="text-xs sm:text-sm text-gray-300">
                  {t('about.security.burned.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 sm:gap-3">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm sm:text-base font-semibold mb-1">{t('about.security.immutable.title')}</p>
                <p className="text-xs sm:text-sm text-gray-300">
                  {t('about.security.immutable.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 sm:gap-3">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm sm:text-base font-semibold mb-1">{t('about.security.opensource.title')}</p>
                <p className="text-xs sm:text-sm text-gray-300">
                  All smart contracts are open-sourced on{' '}
                  <a
                    href="https://github.com/mcneilljamie/mcfun_eth"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white font-medium"
                  >
                    GitHub
                  </a>
                  {' '}and can be viewed and verified on Etherscan. Audit the code yourself before using the platform.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-green-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-emerald-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <ArrowLeftRight className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
            {t('about.trading.title')}
          </h2>

          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-emerald-200">
              <div className="flex items-start gap-3">
                <Coins className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.trading.builtInAMM.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.trading.builtInAMM.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-emerald-200">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.trading.instantTrades.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.trading.instantTrades.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-emerald-200">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.trading.fairPricing.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.trading.fairPricing.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-emerald-200">
              <div className="flex items-start gap-3">
                <Droplets className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.trading.permanentLiquidity.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.trading.permanentLiquidity.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-blue-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            {t('about.visibility.title')}
          </h2>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {t('about.visibility.description')}
          </p>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-blue-200">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.visibility.ranking.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.visibility.ranking.description')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-blue-200">
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('about.visibility.permanent.title')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('about.visibility.permanent.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-purple-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
            {t('aboutPage.trackHoldings')}
          </h2>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {t('aboutPage.trackHoldingsDescription')}
          </p>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-purple-200">
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.realtimeTracking')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.realtimeTrackingDescription')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-purple-200">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.trackLockedTokens')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.trackLockedTokensDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-amber-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
            {t('aboutPage.tokenLocking')}
          </h2>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {t('aboutPage.tokenLockingDescription')}
          </p>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-amber-200">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.lockAnyToken')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.lockAnyTokenDescription')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-amber-200">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.proveTrust')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.proveTrustDescription')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-amber-200">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.deferGratification')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.deferGratificationDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-red-200 dark:border-gray-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Flame className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
            {t('aboutPage.tokenBurning')}
          </h2>
          <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {t('aboutPage.tokenBurningDescription')}
          </p>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-red-200">
              <div className="flex items-start gap-3">
                <Flame className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.reduceSupply')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.reduceSupplyDescription')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-red-200">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.increaseScarcity')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.increaseScarcityDescription')}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800/80 backdrop-blur rounded-lg p-4 border border-red-200">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1">{t('aboutPage.permanentRemoval')}</h3>
                  <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    {t('aboutPage.permanentRemovalDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.fees.title')}
          </h2>

          <div className="space-y-4 sm:space-y-6">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3 sm:gap-4">
                <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900 dark:text-white flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">{t('about.fees.launch.title')}</h3>
                  <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-2">{t('about.fees.launch.amount')}</div>
                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    {t('about.fees.launch.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3 sm:gap-4">
                <Lock className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900 dark:text-white flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">{t('about.fees.locking.title')}</h3>
                  <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-2">{t('about.fees.locking.amount')}</div>
                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    {t('about.fees.locking.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 rounded-lg border-2 border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-3 sm:gap-4">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900 dark:text-white flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">{t('about.fees.trading.title')}</h3>
                  <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-2">{t('about.fees.trading.amount')}</div>
                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    {t('about.fees.trading.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8 border border-gray-300 dark:border-gray-600">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">
            {t('aboutPage.riskDisclaimer')}
          </h2>
          <div className="space-y-3 text-xs sm:text-sm text-gray-800 dark:text-gray-100 leading-relaxed">
            <p className="font-semibold">
              {t('aboutPage.disclaimerImportant')}
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>{t('aboutPage.riskOfLoss')}</strong> {t('aboutPage.riskOfLossDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.noGuarantees')}</strong> {t('aboutPage.noGuaranteesDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.noFinancialAdvice')}</strong> {t('aboutPage.noFinancialAdviceDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.smartContractRisks')}</strong> {t('aboutPage.smartContractRisksDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.noResponsibility')}</strong> {t('aboutPage.noResponsibilityDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.regulatoryUncertainty')}</strong> {t('aboutPage.regulatoryUncertaintyDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.noRecourse')}</strong> {t('aboutPage.noRecourseDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.platformAvailability')}</strong> {t('aboutPage.platformAvailabilityDescription')}
              </li>
              <li>
                <strong>{t('aboutPage.delistingRights')}</strong> {t('aboutPage.delistingRightsDescription')}
              </li>
            </ul>
            <p className="font-semibold pt-2">
              {t('aboutPage.acknowledgement')}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
