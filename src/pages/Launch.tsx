import { useState } from 'react';
import { Rocket, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { createToken } from '../lib/contracts';
import { MIN_LIQUIDITY_ETH, MIN_LIQUIDITY_PERCENT, RECOMMENDED_LIQUIDITY_PERCENT, TOTAL_SUPPLY } from '../contracts/addresses';
import { formatNumber } from '../lib/utils';

interface LaunchProps {
  onNavigate: (page: string) => void;
}

export function Launch({ onNavigate }: LaunchProps) {
  const { t } = useTranslation();
  const { account, signer, connect } = useWeb3();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [liquidityPercent, setLiquidityPercent] = useState(RECOMMENDED_LIQUIDITY_PERCENT);
  const [ethAmount, setEthAmount] = useState(MIN_LIQUIDITY_ETH);

  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    tokenAddress: string;
    ammAddress: string;
    txHash: string;
  } | null>(null);

  const tokensToLiquidity = (TOTAL_SUPPLY * liquidityPercent) / 100;
  const tokensToCreator = TOTAL_SUPPLY - tokensToLiquidity;

  const handleLaunch = async () => {
    if (!signer || !account) {
      connect();
      return;
    }

    setError('');
    setSuccess(null);

    if (!name.trim() || !symbol.trim()) {
      setError(t('launch.errors.nameAndSymbol'));
      return;
    }

    if (parseFloat(ethAmount) < parseFloat(MIN_LIQUIDITY_ETH)) {
      setError(t('launch.errors.minLiquidity', { min: MIN_LIQUIDITY_ETH }));
      return;
    }

    if (liquidityPercent < MIN_LIQUIDITY_PERCENT || liquidityPercent > 100) {
      setError(t('launch.errors.liquidityRange', { min: MIN_LIQUIDITY_PERCENT }));
      return;
    }

    setIsLaunching(true);

    try {
      const result = await createToken(signer, {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        liquidityPercent,
        ethAmount,
      });

      setSuccess(result);
      setName('');
      setSymbol('');
      setLiquidityPercent(RECOMMENDED_LIQUIDITY_PERCENT);
      setEthAmount(MIN_LIQUIDITY_ETH);
    } catch (err: any) {
      console.error('Failed to launch token:', err);
      setError(err.message || 'Failed to launch token. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gray-900 p-2 rounded-lg">
              <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('launch.title')}</h1>
          </div>

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">{t('launch.success.title')}</h3>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>{t('launch.success.token')} {success.tokenAddress}</p>
                    <p>{t('launch.success.dex')} {success.ammAddress}</p>
                    <p>{t('launch.success.tx')} {success.txHash}</p>
                  </div>
                  <button
                    onClick={() => onNavigate('tokens')}
                    className="mt-3 text-sm font-medium text-green-700 hover:text-green-600"
                  >
                    {t('launch.success.viewTokens')}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                {t('launch.form.tokenName')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('launch.form.tokenNamePlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                disabled={isLaunching}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('launch.form.tokenSymbol')}
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder={t('launch.form.tokenSymbolPlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent uppercase"
                disabled={isLaunching}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('launch.form.liquidityAllocation', { percent: liquidityPercent })}
              </label>
              <p className="text-sm text-gray-500 mb-3">
                {t('launch.form.liquidityNote', { min: MIN_LIQUIDITY_PERCENT, recommended: RECOMMENDED_LIQUIDITY_PERCENT })}
              </p>
              <input
                type="range"
                min={MIN_LIQUIDITY_PERCENT}
                max="100"
                value={liquidityPercent}
                onChange={(e) => setLiquidityPercent(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                disabled={isLaunching}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{MIN_LIQUIDITY_PERCENT}%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('launch.form.initialLiquidity')}
              </label>
              <p className="text-sm text-gray-500 mb-3">
                {t('launch.form.liquidityWarning', { min: MIN_LIQUIDITY_ETH })}
              </p>
              <input
                type="number"
                step="0.01"
                min={MIN_LIQUIDITY_ETH}
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder={MIN_LIQUIDITY_ETH}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                disabled={isLaunching}
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-gray-900 mb-3">{t('launch.form.distribution')}</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('launch.form.totalSupply')}</span>
                <span className="font-medium text-gray-900">{formatNumber(TOTAL_SUPPLY)} {t('common.tokens')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('launch.form.toLiquidity')}</span>
                <span className="font-medium text-gray-900">{formatNumber(tokensToLiquidity)} {t('common.tokens')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('launch.form.toWallet')}</span>
                <span className="font-medium text-gray-900">{formatNumber(tokensToCreator)} {t('common.tokens')}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('launch.form.initialLiq')}</span>
                  <span className="font-medium text-gray-900">{ethAmount} {t('common.eth')}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLaunch}
              disabled={isLaunching || !signer}
              className="w-full bg-gray-900 text-white py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-gray-800 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2 touch-manipulation"
            >
              {isLaunching ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>{t('launch.form.launching')}</span>
                </>
              ) : !account ? (
                <span className="text-sm sm:text-base">{t('launch.form.connectToLaunch')}</span>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  <span>{t('launch.form.launchButton')}</span>
                </>
              )}
            </button>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
              <h4 className="font-medium text-blue-900 mb-2 text-sm sm:text-base">{t('launch.notes.title')}</h4>
              <ul className="text-xs sm:text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>{t('launch.notes.fixedSupply')}</li>
                <li>{t('launch.notes.burnedLiquidity')}</li>
                <li>{t('launch.notes.noFees')}</li>
                <li>{t('launch.notes.tradingFee')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
