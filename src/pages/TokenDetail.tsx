import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, CheckCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatAddress, formatTimeAgo, formatUSD, ethToUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { PriceChart } from '../components/PriceChart';
import { getAMMReserves } from '../lib/contracts';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
  onTrade: (token: Token) => void;
}

export function TokenDetail({ tokenAddress, onBack, onTrade }: TokenDetailProps) {
  const { t } = useTranslation();
  const { provider, chainId } = useWeb3();
  const [token, setToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [liveReserves, setLiveReserves] = useState<{ reserveETH: string; reserveToken: string } | null>(null);

  useEffect(() => {
    loadToken();
    loadEthPrice();

    const ethPriceInterval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(ethPriceInterval);
  }, [tokenAddress]);

  useEffect(() => {
    if (token && provider) {
      loadLiveReserves();
      const reservesInterval = setInterval(loadLiveReserves, 10000);
      return () => clearInterval(reservesInterval);
    }
  }, [token, provider]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const loadToken = async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('token_address', tokenAddress)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setToken(data);
      }
    } catch (err) {
      console.error('Failed to load token:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLiveReserves = async () => {
    if (!token || !provider) return;

    try {
      const reserves = await getAMMReserves(provider, token.amm_address);
      setLiveReserves({
        reserveETH: reserves.reserveETH,
        reserveToken: reserves.reserveToken,
      });
    } catch (err) {
      console.error('Failed to load live reserves:', err);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const calculateTokenPriceUSD = (): number => {
    if (!token) return 0;

    const ethReserve = liveReserves
      ? parseFloat(liveReserves.reserveETH)
      : parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
    const tokenReserve = liveReserves
      ? parseFloat(liveReserves.reserveToken)
      : parseFloat(token.current_token_reserve?.toString() || '1000000');

    if (tokenReserve === 0) return 0;

    const priceInEth = ethReserve / tokenReserve;
    return priceInEth * ethPriceUSD;
  };

  const calculateMarketCap = (): number => {
    const TOKEN_TOTAL_SUPPLY = 1000000;
    const priceUSD = calculateTokenPriceUSD();
    return priceUSD * TOKEN_TOTAL_SUPPLY;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">{t('tokenDetail.loadingToken')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('tokenDetail.backToTokens')}</span>
          </button>
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <p className="text-gray-600">{t('tokenDetail.tokenNotFound')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('tokenDetail.backToTokens')}</span>
        </button>

        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{token.name}</h1>
              <div className="flex items-center space-x-3">
                <span className="text-xl text-gray-600">{token.symbol}</span>
                <button
                  onClick={() => copyToClipboard(token.token_address)}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                >
                  <span className="font-mono">{formatAddress(token.token_address)}</span>
                  {copiedAddress ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <a
                  href={`${getExplorerUrl(chainId || 11155111)}/token/${token.token_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  title={t('tokenDetail.viewOnEtherscan')}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                {token.website && (
                  <a
                    href={token.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1"
                    title="Visit Website"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Website</span>
                  </a>
                )}
              </div>
            </div>

            <button
              onClick={() => onTrade(token)}
              className="bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <TrendingUp className="w-5 h-5" />
              <span>{t('tokenDetail.trade')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">{t('tokenDetail.price')}</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(calculateTokenPriceUSD(), false)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">{t('tokenDetail.marketCap')}</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(calculateMarketCap(), true)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">{t('tokenDetail.liquidity')}</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(ethToUSD(liveReserves?.reserveETH || token.current_eth_reserve || token.initial_liquidity_eth, ethPriceUSD), true)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(liveReserves?.reserveETH || token.current_eth_reserve || token.initial_liquidity_eth)}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <PriceChart
            tokenAddress={token.token_address}
            tokenSymbol={token.symbol}
            currentPriceUSD={calculateTokenPriceUSD()}
            ammAddress={token.amm_address}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('tokenDetail.tokenInformation')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{t('tokenDetail.totalSupply')}</span>
                <span className="font-semibold text-gray-900">1,000,000 {token.symbol}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{t('tokenDetail.creator')}</span>
                <button
                  onClick={() => copyToClipboard(token.creator_address)}
                  className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                >
                  <span className="font-mono text-sm">{formatAddress(token.creator_address)}</span>
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{t('tokenDetail.created')}</span>
                <span className="font-semibold text-gray-900">{formatTimeAgo(token.created_at)}</span>
              </div>
              {token.website && (
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="text-gray-600">{t('tokenDetail.website')}</span>
                  <a
                    href={token.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                  >
                    <span className="text-sm truncate max-w-[200px]">{token.website.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">{t('tokenDetail.tokenContract')}</span>
                <a
                  href={`${getExplorerUrl(chainId || 11155111)}/token/${token.token_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                >
                  <span className="font-mono text-sm">{formatAddress(token.token_address)}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('tokenDetail.poolInformation')}</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{t('tokenDetail.ethReserve')}</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(liveReserves?.reserveETH || token.current_eth_reserve || token.initial_liquidity_eth)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{token.symbol} {t('tokenDetail.reserve')}</span>
                <span className="font-semibold text-gray-900">
                  {parseFloat(liveReserves?.reserveToken || token.current_token_reserve?.toString() || '0').toLocaleString()} {token.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">{t('tokenDetail.ammContract')}</span>
                <a
                  href={`${getExplorerUrl(chainId || 11155111)}/address/${token.amm_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                >
                  <span className="font-mono text-sm">{formatAddress(token.amm_address)}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
