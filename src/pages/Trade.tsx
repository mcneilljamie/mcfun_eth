import { useState, useEffect } from 'react';
import { ArrowDownUp, AlertCircle, Loader, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { swapTokens, getQuote, getAMMReserves } from '../lib/contracts';
import { formatNumber, formatCurrency, calculatePriceImpact } from '../lib/utils';
import { Token } from '../lib/supabase';
import { TokenSelector } from '../components/TokenSelector';

interface TradeProps {
  selectedToken?: Token;
}

export function Trade({ selectedToken }: TradeProps) {
  const { t } = useTranslation();
  const { account, signer, provider, connect } = useWeb3();

  const [selectedTokenData, setSelectedTokenData] = useState<Token | null>(selectedToken || null);

  const [isETHToToken, setIsETHToToken] = useState(true);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [slippage, setSlippage] = useState(2);

  const [isSwapping, setIsSwapping] = useState(false);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [reserves, setReserves] = useState<{ reserveETH: string; reserveToken: string } | null>(null);

  useEffect(() => {
    if (selectedToken) {
      setSelectedTokenData(selectedToken);
    }
  }, [selectedToken]);

  useEffect(() => {
    if (selectedTokenData && provider) {
      loadReserves();
    }
  }, [selectedTokenData, provider]);

  useEffect(() => {
    if (amountIn && selectedTokenData && provider) {
      loadQuote();
    } else {
      setAmountOut('');
    }
  }, [amountIn, isETHToToken, selectedTokenData, provider]);

  const loadReserves = async () => {
    if (!selectedTokenData || !provider) return;

    try {
      const reserveData = await getAMMReserves(provider, selectedTokenData.amm_address);
      setReserves(reserveData);
    } catch (err) {
      console.error('Failed to load reserves:', err);
    }
  };

  const loadQuote = async () => {
    if (!selectedTokenData || !provider || !amountIn || parseFloat(amountIn) <= 0) {
      setAmountOut('');
      return;
    }

    setIsLoadingQuote(true);

    try {
      const quote = await getQuote(provider, selectedTokenData.amm_address, isETHToToken, amountIn);
      setAmountOut(quote);
    } catch (err) {
      console.error('Failed to get quote:', err);
      setAmountOut('');
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleSwap = async () => {
    if (!signer || !account) {
      connect();
      return;
    }

    if (!selectedTokenData || !amountIn || !amountOut) {
      setError(t('trade.error'));
      return;
    }

    setError('');
    setSuccess('');
    setIsSwapping(true);

    try {
      const minAmountOut = (parseFloat(amountOut) * (100 - slippage) / 100).toString();

      await swapTokens(signer, {
        ammAddress: selectedTokenData.amm_address,
        isETHToToken,
        amountIn,
        minAmountOut,
      });

      setSuccess(t('trade.success'));
      setAmountIn('');
      setAmountOut('');
      loadReserves();
    } catch (err: any) {
      console.error('Failed to swap:', err);
      setError(err.message || 'Failed to complete swap. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleFlip = () => {
    setIsETHToToken(!isETHToToken);
    setAmountIn('');
    setAmountOut('');
  };

  const priceImpact = reserves && amountIn && amountOut
    ? calculatePriceImpact(
        parseFloat(amountIn),
        parseFloat(amountOut),
        isETHToToken
          ? parseFloat(reserves.reserveToken) / parseFloat(reserves.reserveETH)
          : parseFloat(reserves.reserveETH) / parseFloat(reserves.reserveToken)
      )
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gray-900 p-2 rounded-lg">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('trade.title')}</h1>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('trade.selectToken')}
              </label>
              <TokenSelector
                selectedToken={selectedTokenData}
                onSelectToken={setSelectedTokenData}
                disabled={isSwapping}
              />
            </div>

            {reserves && selectedTokenData && (
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <h3 className="font-medium text-gray-900 mb-2 text-sm sm:text-base">{t('trade.poolLiquidity')}</h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="text-gray-600">{t('trade.ethReserve')}</span>
                    <p className="font-medium text-gray-900">{formatCurrency(reserves.reserveETH)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">{t('trade.tokenReserve', { symbol: selectedTokenData.symbol })}</span>
                    <p className="font-medium text-gray-900">{formatNumber(reserves.reserveToken)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  {t('trade.youPay')}
                </label>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-xl sm:text-2xl font-semibold outline-none"
                    disabled={isSwapping || !selectedTokenData}
                  />
                  <span className="text-base sm:text-lg font-semibold text-gray-900 whitespace-nowrap">
                    {isETHToToken ? t('common.eth') : selectedTokenData?.symbol || 'TOKEN'}
                  </span>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleFlip}
                  className="bg-white border-2 border-gray-900 p-2 rounded-lg hover:bg-gray-50 transition-colors touch-manipulation"
                  disabled={isSwapping}
                >
                  <ArrowDownUp className="w-5 h-5 text-gray-900" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  {t('trade.youReceive')}
                </label>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="text"
                    value={isLoadingQuote ? 'Loading...' : amountOut}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-xl sm:text-2xl font-semibold outline-none"
                    disabled
                  />
                  <span className="text-base sm:text-lg font-semibold text-gray-900 whitespace-nowrap">
                    {isETHToToken ? selectedTokenData?.symbol || 'TOKEN' : t('common.eth')}
                  </span>
                </div>
              </div>
            </div>

            {amountIn && amountOut && (
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('trade.priceImpact')}</span>
                  <span className={`font-medium ${priceImpact > 5 ? 'text-red-600' : 'text-gray-900'}`}>
                    {priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('trade.slippageTolerance')}</span>
                  <span className="font-medium text-gray-900">{slippage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('trade.tradingFee')}</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(parseFloat(amountIn) * 0.004)} {isETHToToken ? t('common.eth') : selectedTokenData?.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('trade.minReceived')}</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(parseFloat(amountOut) * (100 - slippage) / 100)} {isETHToToken ? selectedTokenData?.symbol : t('common.eth')}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                {t('trade.slippageLabel', { percent: slippage })}
              </label>
              <div className="flex space-x-2">
                {[0.5, 1, 2, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`flex-1 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors touch-manipulation ${
                      slippage === value
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    disabled={isSwapping}
                  >
                    {value}%
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSwap}
              disabled={isSwapping || !selectedTokenData || !amountIn || !amountOut || !signer}
              className="w-full bg-gray-900 text-white py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-gray-800 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 touch-manipulation"
            >
              {isSwapping ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>{t('trade.swapping')}</span>
                </>
              ) : !account ? (
                <span className="text-sm sm:text-base">{t('trade.connectToTrade')}</span>
              ) : !selectedTokenData ? (
                <span className="text-sm sm:text-base">{t('trade.selectAToken')}</span>
              ) : (
                <span>{t('trade.swapButton')}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
