import { useState, useEffect } from 'react';
import { ArrowDownUp, AlertCircle, Loader, TrendingUp, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { swapTokens, getQuote, getAMMReserves } from '../lib/contracts';
import { formatNumber, formatCurrency, calculatePriceImpact } from '../lib/utils';
import { Token } from '../lib/supabase';
import { TokenSelector } from '../components/TokenSelector';
import { SwapConfirmation } from '../components/SwapConfirmation';
import { Contract, formatEther } from 'ethers';

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
  const [swapSuccess, setSwapSuccess] = useState<{
    amountIn: string;
    amountOut: string;
    txHash: string;
  } | null>(null);

  const [reserves, setReserves] = useState<{ reserveETH: string; reserveToken: string } | null>(null);
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [tokenBalance, setTokenBalance] = useState<string>('0');

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
    if (account && provider) {
      loadBalances();
    }
  }, [account, provider, selectedTokenData]);

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

  const loadBalances = async () => {
    if (!account || !provider) return;

    try {
      const ethBal = await provider.getBalance(account);
      setEthBalance(formatEther(ethBal));

      if (selectedTokenData) {
        const tokenContract = new Contract(
          selectedTokenData.token_address,
          ['function balanceOf(address) view returns (uint256)'],
          provider
        );
        const tokenBal = await tokenContract.balanceOf(account);
        setTokenBalance(formatEther(tokenBal));
      } else {
        setTokenBalance('0');
      }
    } catch (err) {
      console.error('Failed to load balances:', err);
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
    setSwapSuccess(null);
    setIsSwapping(true);

    try {
      const minAmountOut = (parseFloat(amountOut) * (100 - slippage) / 100).toString();

      const receipt = await swapTokens(signer, {
        ammAddress: selectedTokenData.amm_address,
        isETHToToken,
        amountIn,
        minAmountOut,
      });

      setSwapSuccess({
        amountIn,
        amountOut,
        txHash: receipt.hash,
      });

      loadReserves();
      loadBalances();

      // Update data in the background (non-blocking)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Index the swap event
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
      }).catch(err => console.error('Failed to index swap:', err));

      // Create a price snapshot immediately
      fetch(`${supabaseUrl}/functions/v1/price-snapshot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
      }).catch(err => console.error('Failed to create snapshot:', err));
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
    <>
      {swapSuccess && selectedTokenData && (
        <SwapConfirmation
          amountIn={swapSuccess.amountIn}
          amountOut={swapSuccess.amountOut}
          tokenSymbol={selectedTokenData.symbol}
          tokenAddress={selectedTokenData.token_address}
          ammAddress={selectedTokenData.amm_address}
          txHash={swapSuccess.txHash}
          isETHToToken={isETHToToken}
          onClose={() => {
            setSwapSuccess(null);
            setAmountIn('');
            setAmountOut('');
          }}
        />
      )}

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
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">
                    {t('trade.youPay')}
                  </label>
                  {account && (
                    <div className="flex items-center space-x-1 text-xs text-gray-600">
                      <Wallet className="w-3 h-3" />
                      <span>
                        {formatNumber(isETHToToken ? ethBalance : tokenBalance)} {isETHToToken ? t('common.eth') : selectedTokenData?.symbol}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    onInput={(e) => setAmountIn((e.target as HTMLInputElement).value)}
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
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700">
                    {t('trade.youReceive')}
                  </label>
                  {account && (
                    <div className="flex items-center space-x-1 text-xs text-gray-600">
                      <Wallet className="w-3 h-3" />
                      <span>
                        {formatNumber(isETHToToken ? tokenBalance : ethBalance)} {isETHToToken ? selectedTokenData?.symbol : t('common.eth')}
                      </span>
                    </div>
                  )}
                </div>
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
              <>
                {priceImpact > 3 && (
                  <div className={`rounded-lg p-3 sm:p-4 border ${
                    priceImpact > 10 ? 'bg-red-50 border-red-300' : priceImpact > 5 ? 'bg-orange-50 border-orange-300' : 'bg-yellow-50 border-yellow-300'
                  }`}>
                    <div className="flex items-start space-x-2">
                      <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                        priceImpact > 10 ? 'text-red-600' : priceImpact > 5 ? 'text-orange-600' : 'text-yellow-600'
                      }`} />
                      <div>
                        <p className={`text-sm font-semibold ${
                          priceImpact > 10 ? 'text-red-900' : priceImpact > 5 ? 'text-orange-900' : 'text-yellow-900'
                        }`}>
                          {priceImpact > 10 ? 'Very High' : priceImpact > 5 ? 'High' : 'Moderate'} Price Impact
                        </p>
                        <p className={`text-xs mt-1 ${
                          priceImpact > 10 ? 'text-red-800' : priceImpact > 5 ? 'text-orange-800' : 'text-yellow-800'
                        }`}>
                          This trade will significantly affect the token price. Consider reducing your trade size or increasing slippage tolerance if the transaction fails.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('trade.priceImpact')}</span>
                    <span className={`font-medium ${priceImpact > 5 ? 'text-red-600' : 'text-gray-900'}`}>
                      {priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('trade.slippageTolerance')}</span>
                    <span className="font-medium text-gray-900">{slippage === 100 ? 'Unlimited' : `${slippage}%`}</span>
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
                      {slippage === 100 ? '0' : formatNumber(parseFloat(amountOut) * (100 - slippage) / 100)} {isETHToToken ? selectedTokenData?.symbol : t('common.eth')}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                {t('trade.slippageLabel', { percent: slippage === 100 ? 'Unlimited' : slippage })}
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[0.5, 1, 2, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`py-2 rounded-lg text-sm sm:text-base font-medium transition-colors touch-manipulation ${
                      slippage === value
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    disabled={isSwapping}
                  >
                    {value}%
                  </button>
                ))}
                <button
                  onClick={() => setSlippage(100)}
                  className={`py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors touch-manipulation ${
                    slippage === 100
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  disabled={isSwapping}
                  title="No slippage limit - use with caution"
                >
                  Unlimited
                </button>
              </div>
              {slippage === 100 && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-800">
                    <span className="font-semibold">Warning:</span> Unlimited slippage may result in unfavorable trade prices.
                  </p>
                </div>
              )}
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
    </>
  );
}
