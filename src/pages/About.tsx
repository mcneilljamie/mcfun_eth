import { useState, useEffect } from 'react';
import { Shield, Lock, Coins, TrendingUp, Users, Zap, DollarSign, Check, Eye, BarChart3, Wallet, Flame, ArrowLeftRight, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatUSD } from '../lib/utils';
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
  const [mcfunMarketCapPercent, setMcfunMarketCapPercent] = useState<number>(0);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const loadData = async () => {
    try {
      const ethPrice = await getEthPriceUSD();

      // Get the timestamp of the last ETH price update
      const { data: ethPriceData } = await supabase
        .from('eth_price_history')
        .select('timestamp')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (ethPriceData?.timestamp) {
        setLastUpdated(new Date(ethPriceData.timestamp));
      }

      // Load platform stats
      const { data: statsData, error: statsError } = await supabase
        .from('platform_stats')
        .select('total_market_cap_usd, total_volume_eth, total_burned_usd, total_locked_usd, token_count')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (statsError) {
        console.error('Error loading platform stats:', statsError);
      }

      // Count tokens by chain first, before using statsData
      const { data: chainCountData } = await supabase
        .from('tokens')
        .select('chain_id');

      const ethereumCount = chainCountData?.filter(t => t.chain_id === 1).length || 0;
      const baseCount = chainCountData?.filter(t => t.chain_id === 8453).length || 0;

      if (statsData) {
        setPlatformStats({
          totalMarketCapUsd: parseFloat(statsData.total_market_cap_usd || '0'),
          totalVolumeEth: parseFloat(statsData.total_volume_eth || '0'),
          totalBurnedUsd: parseFloat(statsData.total_burned_usd || '0'),
          totalLockedUsd: parseFloat(statsData.total_locked_usd || '0'),
          tokenCount: statsData.token_count || 0,
          ethereumCount,
          baseCount,
        });
      }

      // Load all tokens from ALL chains (Ethereum + Base)
      const { data: tokensData, error: tokensError } = await supabase
        .from('tokens')
        .select('current_eth_reserve, initial_liquidity_eth, current_token_reserve, price_change_24h, total_volume_eth, chain_id');

      if (tokensError) {
        console.error('Database error loading tokens:', tokensError);
      } else if (tokensData) {
        // Calculate total liquidity (both sides of the pool)
        const totalEth = tokensData.reduce((sum, token) => {
          const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
          return sum + reserve;
        }, 0);

        // Calculate Ethereum liquidity
        const ethereumEth = tokensData
          .filter(token => token.chain_id === 1)
          .reduce((sum, token) => {
            const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
            return sum + reserve;
          }, 0);

        // Calculate Base liquidity
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

        // Calculate McFun market cap percentage
        const { data: mcfunToken } = await supabase
          .from('tokens')
          .select('current_eth_reserve, current_token_reserve')
          .eq('symbol', 'MCFUN')
          .maybeSingle();

        if (mcfunToken && statsData && parseFloat(statsData.total_market_cap_usd || '0') > 0) {
          const ethReserve = parseFloat(mcfunToken.current_eth_reserve || '0');
          const tokenReserve = parseFloat(mcfunToken.current_token_reserve || '0');

          // Calculate McFun token price in ETH
          const priceEth = tokenReserve > 0 ? ethReserve / tokenReserve : 0;

          // Calculate McFun market cap (total supply * price in USD)
          const totalSupply = 1000000; // McFun has 1M total supply
          const mcfunMarketCapUSD = totalSupply * priceEth * ethPrice;

          // Calculate percentage of total market cap
          const totalMarketCap = parseFloat(statsData.total_market_cap_usd);
          const mcfunPercent = totalMarketCap > 0 ? (mcfunMarketCapUSD / totalMarketCap) * 100 : 0;
          setMcfunMarketCapPercent(mcfunPercent);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2">
            {t('about.title')}
          </h1>
          <p className="text-base sm:text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto px-4">
            {t('about.subtitle')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-green-200">
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('aboutPage.platformStats')}</h2>
            {timeAgo && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Last updated {timeAgo}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{t('aboutPage.totalLiquidity')}</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
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
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats ? formatUSD(platformStats.totalMarketCapUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('aboutPage.combinedFDV')}</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Lock className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Total Locked</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats ? formatUSD(platformStats.totalLockedUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total value locked on McFun</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Total Burned</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats ? formatUSD(platformStats.totalBurnedUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total value burned</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">{t('aboutPage.projectsListed')}</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats ? platformStats.tokenCount.toLocaleString() : '0'}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('aboutPage.totalProjects')}</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <ArrowLeftRight className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Tokens by Chain</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats && platformStats.tokenCount > 0
                    ? `${Math.round((platformStats.ethereumCount / platformStats.tokenCount) * 100)}% : ${Math.round((platformStats.baseCount / platformStats.tokenCount) * 100)}%`
                    : '0% : 0%'
                  }
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Ethereum : Base</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Droplets className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Ethereum Liquidity</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {formatUSD(ethereumLiquidityUSD, true)}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total liquidity on Ethereum</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Droplets className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Base Liquidity</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {formatUSD(baseLiquidityUSD, true)}
                </div>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Total liquidity on Base</p>
            </div>

            <div className="text-center bg-white dark:bg-gray-800/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">MCFUN % of FDV</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {mcfunMarketCapPercent > 0 ? `${mcfunMarketCapPercent.toFixed(1)}%` : '0%'}
                </div>
              )}
              <a href="https://mcfun.io/token/0xe03e4d90a46f62ac405708ba5036f292d5e0edc8" className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-100 mt-1 inline-block">MCFUN as a share of total platform FDV</a>
            </div>
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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
                <div className="bg-green-100 p-1.5 sm:p-2 rounded-lg">
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
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

        <div className="bg-gradient-to-br from-emerald-50 to-green-100 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-emerald-200">
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

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-blue-200">
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

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-purple-200">
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

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-amber-200">
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

        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-red-200">
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
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('about.fees.trading.amount')}</div>
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
