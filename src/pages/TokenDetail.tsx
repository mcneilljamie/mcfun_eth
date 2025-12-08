import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, CheckCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase, Token } from '../lib/supabase';
import { formatCurrency, formatAddress, formatTimeAgo, formatUSD, ethToUSD } from '../lib/utils';
import { getEthPriceUSD } from '../lib/ethPrice';
import { PriceChart } from '../components/PriceChart';

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
  onTrade: (token: Token) => void;
}

export function TokenDetail({ tokenAddress, onBack, onTrade }: TokenDetailProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState<Token | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);

  useEffect(() => {
    loadToken();
    loadEthPrice();

    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

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
    const ethReserve = parseFloat(token.current_eth_reserve?.toString() || token.initial_liquidity_eth.toString());
    const tokenReserve = parseFloat(token.current_token_reserve?.toString() || '1000000');

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
            <p className="mt-4 text-gray-600">Loading token...</p>
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
            <span>Back to Tokens</span>
          </button>
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <p className="text-gray-600">Token not found</p>
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
          <span>Back to Tokens</span>
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
                  href={`https://etherscan.io/token/${token.token_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  title="View on Etherscan"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            <button
              onClick={() => onTrade(token)}
              className="bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center space-x-2"
            >
              <TrendingUp className="w-5 h-5" />
              <span>Trade</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Price</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(calculateTokenPriceUSD(), false)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(calculateTokenPriceUSD() / ethPriceUSD)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Market Cap</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(calculateMarketCap(), true)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Liquidity</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(ethToUSD(token.current_eth_reserve || token.initial_liquidity_eth, ethPriceUSD), true)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(token.current_eth_reserve || token.initial_liquidity_eth)}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">All-Time Volume</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900">
                {formatUSD(ethToUSD(token.total_volume_eth, ethPriceUSD), true)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatCurrency(token.total_volume_eth)}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <PriceChart tokenAddress={token.token_address} tokenSymbol={token.symbol} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Token Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Total Supply</span>
                <span className="font-semibold text-gray-900">1,000,000 {token.symbol}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Creator</span>
                <button
                  onClick={() => copyToClipboard(token.creator_address)}
                  className="flex items-center space-x-2 text-gray-900 hover:text-gray-700 transition-colors"
                >
                  <span className="font-mono text-sm">{formatAddress(token.creator_address)}</span>
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Created</span>
                <span className="font-semibold text-gray-900">{formatTimeAgo(token.created_at)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Token Contract</span>
                <a
                  href={`https://etherscan.io/token/${token.token_address}`}
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
            <h2 className="text-xl font-bold text-gray-900 mb-4">Pool Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">ETH Reserve</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(token.current_eth_reserve || token.initial_liquidity_eth)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">{token.symbol} Reserve</span>
                <span className="font-semibold text-gray-900">
                  {parseFloat(token.current_token_reserve?.toString() || '0').toLocaleString()} {token.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">AMM Contract</span>
                <a
                  href={`https://etherscan.io/address/${token.amm_address}`}
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
