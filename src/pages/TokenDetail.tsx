import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, CheckCircle, ExternalLink, TrendingUp, Info, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatAddress, formatTimeAgo, formatUSD, ethToUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { getAMMReserves } from '../lib/contracts';
import { useWeb3 } from '../lib/web3';
import { getExplorerUrl } from '../contracts/addresses';
import { PriceChart } from '../components/PriceChart';
import RecentTrades from '../components/RecentTrades';
import { useChartData } from '../hooks/useChartData';
import { ToastMessage } from '../App';

interface TokenDetailProps {
  onTrade: (token: Token) => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function TokenDetail({ onTrade, onShowToast }: TokenDetailProps) {
  const { tokenAddress } = useParams<{ tokenAddress: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { provider, chainId } = useWeb3();
  const [token, setToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [liveReserves, setLiveReserves] = useState<{ reserveETH: string; reserveToken: string } | null>(null);
  const [snapshotCount, setSnapshotCount] = useState<number>(0);
  const { priceChangeSinceLaunch } = useChartData(tokenAddress || '', 'ALL');

  const ensureProtocol = (url: string): string => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `https://${url}`;
  };

  useEffect(() => {
    if (!tokenAddress) {
      setIsLoading(false);
      return;
    }

    loadToken();
    loadEthPrice();
    loadSnapshotCount();

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

  const loadSnapshotCount = async () => {
    if (!tokenAddress) return;

    try {
      const { count, error } = await supabase
        .from('price_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('token_address', tokenAddress.toLowerCase());

      if (error) throw error;
      setSnapshotCount(count || 0);
    } catch (err) {
      console.error('Failed to load snapshot count:', err);
    }
  };

  const loadToken = async () => {
    if (!tokenAddress) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('token_address', tokenAddress.toLowerCase())
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

  const copyToClipboard = async (text: string, identifier: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAddress(identifier);
      setTimeout(() => setCopiedAddress(null), 2000);
      onShowToast({
        message: t('common.copiedToClipboard'),
        type: 'success'
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      onShowToast({
        message: 'Link copied to clipboard!',
        type: 'success'
      });
    } catch (err) {
      console.error('Failed to copy link:', err);
      onShowToast({
        message: 'Failed to copy link',
        type: 'error'
      });
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
            onClick={() => navigate('/tokens')}
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
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/tokens')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('tokenDetail.backToTokens')}</span>
          </button>

          <button
            onClick={shareLink}
            className="flex items-center space-x-2 px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-sm font-medium">Share</span>
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{token.name}</h1>
              <div className="flex items-center space-x-3">
                <span className="text-xl text-gray-600">{token.symbol}</span>
                <button
                  onClick={() => copyToClipboard(token.token_address, 'token')}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
                >
                  <span className="font-mono">{formatAddress(token.token_address)}</span>
                  {copiedAddress === 'token' ? (
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
                    href={ensureProtocol(token.website)}
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
              {(token.telegram_url || token.discord_url || token.x_url) && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {token.telegram_url && (
                    <a
                      href={ensureProtocol(token.telegram_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5"
                      title="Join Telegram"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                      </svg>
                      <span>Telegram</span>
                    </a>
                  )}
                  {token.discord_url && (
                    <a
                      href={ensureProtocol(token.discord_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5"
                      title="Join Discord"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      <span>Discord</span>
                    </a>
                  )}
                  {token.x_url && (
                    <a
                      href={ensureProtocol(token.x_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5"
                      title="Follow on X"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      <span>X</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => onTrade(token)}
              className="bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <TrendingUp className="w-5 h-5" />
              <span>{t('tokenDetail.trade')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 sm:gap-6">
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

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">{t('tokens.table.returnMultiple')}</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {priceChangeSinceLaunch !== null ? (1 + priceChangeSinceLaunch / 100).toFixed(2) : '1.00'}x
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Holders</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {token.holder_count?.toLocaleString() || '0'}
              </div>
            </div>
          </div>
        </div>

        {snapshotCount < 2 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-800">
              Chart data appears after at least 2 trades have been made with this token.
            </p>
          </div>
        )}

        <PriceChart
          tokenAddress={token.token_address}
          tokenSymbol={token.symbol}
          theme="light"
          livePrice={calculateTokenPriceUSD()}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
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
                  onClick={() => copyToClipboard(token.creator_address, 'creator')}
                  className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                >
                  <span className="font-mono text-sm">{formatAddress(token.creator_address)}</span>
                  {copiedAddress === 'creator' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
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
                    href={ensureProtocol(token.website)}
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

        <div className="mt-6">
          <RecentTrades
            tokenAddress={token.token_address}
            tokenSymbol={token.symbol}
            chainId={chainId || 11155111}
          />
        </div>
      </div>
    </div>
  );
}
