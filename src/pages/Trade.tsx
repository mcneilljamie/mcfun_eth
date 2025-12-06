import { useState, useEffect } from 'react';
import { ArrowDownUp, AlertCircle, Loader, TrendingUp } from 'lucide-react';
import { useWeb3 } from '../lib/web3';
import { swapTokens, getQuote, getAMMReserves } from '../lib/contracts';
import { formatNumber, formatCurrency, calculatePriceImpact } from '../lib/utils';
import { supabase, Token } from '../lib/supabase';

interface TradeProps {
  selectedToken?: Token;
}

export function Trade({ selectedToken }: TradeProps) {
  const { account, signer, provider, connect } = useWeb3();

  const [tokens, setTokens] = useState<Token[]>([]);
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
    loadTokens();
  }, []);

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

  const loadTokens = async () => {
    const { data } = await supabase
      .from('tokens')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      setTokens(data);
      if (!selectedTokenData && data.length > 0) {
        setSelectedTokenData(data[0]);
      }
    }
  };

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
      setError('Please enter an amount');
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

      setSuccess('Swap completed successfully!');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gray-900 p-2 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Trade Tokens</h1>
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
                Select Token
              </label>
              <select
                value={selectedTokenData?.token_address || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.token_address === e.target.value);
                  setSelectedTokenData(token || null);
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="">Select a token</option>
                {tokens.map((token) => (
                  <option key={token.token_address} value={token.token_address}>
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </select>
            </div>

            {reserves && selectedTokenData && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Pool Liquidity</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">ETH Reserve:</span>
                    <p className="font-medium text-gray-900">{formatCurrency(reserves.reserveETH)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">{selectedTokenData.symbol} Reserve:</span>
                    <p className="font-medium text-gray-900">{formatNumber(reserves.reserveToken)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  You Pay
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-2xl font-semibold outline-none"
                    disabled={isSwapping || !selectedTokenData}
                  />
                  <span className="text-lg font-semibold text-gray-900">
                    {isETHToToken ? 'ETH' : selectedTokenData?.symbol || 'TOKEN'}
                  </span>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleFlip}
                  className="bg-white border-2 border-gray-900 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isSwapping}
                >
                  <ArrowDownUp className="w-5 h-5 text-gray-900" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  You Receive
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={isLoadingQuote ? 'Loading...' : amountOut}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-2xl font-semibold outline-none"
                    disabled
                  />
                  <span className="text-lg font-semibold text-gray-900">
                    {isETHToToken ? selectedTokenData?.symbol || 'TOKEN' : 'ETH'}
                  </span>
                </div>
              </div>
            </div>

            {amountIn && amountOut && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price Impact:</span>
                  <span className={`font-medium ${priceImpact > 5 ? 'text-red-600' : 'text-gray-900'}`}>
                    {priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Slippage Tolerance:</span>
                  <span className="font-medium text-gray-900">{slippage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Trading Fee (0.4%):</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(parseFloat(amountIn) * 0.004)} {isETHToToken ? 'ETH' : selectedTokenData?.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Minimum Received:</span>
                  <span className="font-medium text-gray-900">
                    {formatNumber(parseFloat(amountOut) * (100 - slippage) / 100)} {isETHToToken ? selectedTokenData?.symbol : 'ETH'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slippage Tolerance: {slippage}%
              </label>
              <div className="flex space-x-2">
                {[0.5, 1, 2, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setSlippage(value)}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
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
              className="w-full bg-gray-900 text-white py-4 rounded-lg font-semibold hover:bg-gray-800 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2"
            >
              {isSwapping ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Swapping...</span>
                </>
              ) : !account ? (
                <span>Connect Wallet to Trade</span>
              ) : !selectedTokenData ? (
                <span>Select a Token</span>
              ) : (
                <span>Swap Tokens</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
