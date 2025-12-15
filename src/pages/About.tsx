import { useState, useEffect } from 'react';
import { Shield, Lock, Coins, TrendingUp, Users, Zap, DollarSign, Check, Eye, BarChart3, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatUSD } from '../lib/utils';

interface PlatformStats {
  totalMarketCapUsd: number;
  totalVolumeEth: number;
  tokenCount: number;
}

export function About() {
  const { t } = useTranslation();
  const [totalLiquidity, setTotalLiquidity] = useState<string>('0');
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      // Sync data from blockchain (non-blocking)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Sync reserves
      fetch(`${supabaseUrl}/functions/v1/sync-reserves`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      }).catch(err => console.error('Failed to sync reserves:', err));

      // Index recent swaps
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

      // Load total liquidity
      const { data: tokensData, error: tokensError } = await supabase
        .from('tokens')
        .select('current_eth_reserve, initial_liquidity_eth');

      if (!tokensError && tokensData) {
        const total = tokensData.reduce((sum, token) => {
          const reserve = parseFloat(token.current_eth_reserve || token.initial_liquidity_eth || '0');
          return sum + reserve;
        }, 0);
        setTotalLiquidity(total.toString());
      }

      // Load platform stats (wait a bit for sync to complete)
      setTimeout(async () => {
        const { data: statsData, error: statsError } = await supabase
          .from('platform_stats')
          .select('total_market_cap_usd, total_volume_eth, token_count')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!statsError && statsData) {
          setPlatformStats({
            totalMarketCapUsd: parseFloat(statsData.total_market_cap_usd || '0'),
            totalVolumeEth: parseFloat(statsData.total_volume_eth || '0'),
            tokenCount: statsData.token_count || 0,
          });
        }
      }, 1000);
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
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
            {t('about.title')}
          </h1>
          <p className="text-base sm:text-xl text-gray-600 max-w-3xl mx-auto px-4">
            {t('about.subtitle')}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-green-200">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-6">Platform Statistics</h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            <div className="text-center bg-white/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900">Total Market Cap</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {platformStats ? formatUSD(platformStats.totalMarketCapUsd, true) : '$0'}
                </div>
              )}
              <p className="text-xs text-gray-600 mt-1">Combined FDV of all tokens</p>
            </div>

            <div className="text-center bg-white/60 backdrop-blur rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                <h3 className="text-sm sm:text-base font-bold text-gray-900">Total Liquidity</h3>
              </div>
              {isLoading ? (
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-green-700">
                  {formatCurrency(totalLiquidity)}
                </div>
              )}
              <p className="text-xs text-gray-600 mt-1">Total ETH in liquidity pools</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Zap className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.howWorks.title')}
          </h2>

          <div className="space-y-5 sm:space-y-6">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{t('about.howWorks.step1.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                {t('about.howWorks.step1.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{t('about.howWorks.step2.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                {t('about.howWorks.step2.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{t('about.howWorks.step3.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                {t('about.howWorks.step3.description')}
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{t('about.howWorks.step4.title')}</h3>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                {t('about.howWorks.step4.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-purple-200">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
            Track Your Holdings
          </h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4">
            The Portfolio page makes it effortless to monitor the value of all your McFun token holdings in one place. Simply connect your wallet to see real-time values of your ETH balance and all tokens you own that are traded on McFun.
          </p>
          <div className="bg-white/80 backdrop-blur rounded-lg p-4 border border-purple-200">
            <div className="flex items-start gap-3">
              <BarChart3 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">Real-Time Portfolio Tracking</h3>
                <p className="text-xs sm:text-sm text-gray-700">
                  View your total portfolio value, individual token balances, current prices, and the USD value of each position. Everything updates automatically so you always know exactly what your holdings are worth.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8 border-2 border-blue-200">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            {t('about.visibility.title')}
          </h2>
          <p className="text-sm sm:text-base text-gray-700 leading-relaxed mb-4">
            {t('about.visibility.description')}
          </p>
          <div className="bg-white/80 backdrop-blur rounded-lg p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.visibility.ranking.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-700">
                  {t('about.visibility.ranking.description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.unruggable.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.fair.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  {t('about.why.fair.description')}
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.simple.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.lowBarrier.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.instant.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
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
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-1">{t('about.why.transparent.title')}</h3>
                <p className="text-xs sm:text-sm text-gray-600">
                  {t('about.why.transparent.description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8" />
            {t('about.fees.title')}
          </h2>

          <div className="space-y-4 sm:space-y-6">
            <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border-2 border-gray-200">
              <div className="flex items-start gap-3 sm:gap-4">
                <Coins className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{t('about.fees.launch.title')}</h3>
                  <div className="text-2xl sm:text-3xl font-bold text-green-600 mb-2">{t('about.fees.launch.amount')}</div>
                  <p className="text-sm sm:text-base text-gray-700">
                    {t('about.fees.launch.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border-2 border-gray-200">
              <div className="flex items-start gap-3 sm:gap-4">
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-gray-900 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{t('about.fees.trading.title')}</h3>
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{t('about.fees.trading.amount')}</div>
                  <p className="text-sm sm:text-base text-gray-700">
                    {t('about.fees.trading.description')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 sm:p-6 rounded-lg border-2 border-blue-200">
              <div className="flex items-start gap-3 sm:gap-4">
                <Users className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{t('about.fees.why.title')}</h3>
                  <p className="text-sm sm:text-base text-gray-700">
                    {t('about.fees.why.description')}
                  </p>
                </div>
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
                <p className="text-sm sm:text-base font-semibold mb-1">{t('about.security.transparent.title')}</p>
                <p className="text-xs sm:text-sm text-gray-300">
                  {t('about.security.transparent.description')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 sm:gap-3">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm sm:text-base font-semibold mb-1">{t('about.security.opensource.title')}</p>
                <p className="text-xs sm:text-sm text-gray-300">
                  {t('about.security.opensource.description')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-xl shadow-lg p-5 sm:p-8 border border-gray-300">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 text-center">
            Risk Disclaimer & Terms of Use
          </h2>
          <div className="space-y-3 text-xs sm:text-sm text-gray-800 leading-relaxed">
            <p className="font-semibold">
              IMPORTANT: Trading cryptocurrencies and tokens carries substantial risk. By using this platform, you acknowledge and accept the following:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>High Risk of Loss:</strong> Cryptocurrency trading is extremely volatile and speculative. You may lose some or all of your investment. Only invest what you can afford to lose completely.
              </li>
              <li>
                <strong>No Guarantees:</strong> Past performance does not guarantee future results. Token prices can fluctuate dramatically and unpredictably.
              </li>
              <li>
                <strong>No Financial Advice:</strong> Nothing on this platform constitutes financial, investment, legal, or tax advice. Always conduct your own research and consult with qualified professionals before making investment decisions.
              </li>
              <li>
                <strong>Smart Contract Risks:</strong> While our contracts are designed to be secure and immutable, smart contracts may contain bugs or vulnerabilities. Use at your own risk.
              </li>
              <li>
                <strong>No Responsibility for Losses:</strong> The platform operator, developers, and contributors accept no responsibility or liability for any losses, damages, or adverse outcomes resulting from your use of this platform, including but not limited to trading losses, smart contract failures, network issues, or any other technical problems.
              </li>
              <li>
                <strong>Regulatory Uncertainty:</strong> Cryptocurrency regulations vary by jurisdiction and may change. You are responsible for ensuring your use of this platform complies with all applicable laws in your jurisdiction.
              </li>
              <li>
                <strong>No Recourse:</strong> Blockchain transactions are irreversible. Once a transaction is confirmed, it cannot be undone. Double-check all transaction details before confirming.
              </li>
              <li>
                <strong>Platform Availability:</strong> The platform is provided "as is" without warranties of any kind. We do not guarantee uninterrupted access or error-free operation.
              </li>
            </ul>
            <p className="font-semibold pt-2">
              By using this platform, you acknowledge that you have read, understood, and agreed to these terms. You accept full responsibility for your trading decisions and their outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
