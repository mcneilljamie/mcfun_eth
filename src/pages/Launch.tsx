import { useState, useEffect } from 'react';
import { Rocket, AlertCircle, Loader, Wallet, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { createToken, getETHBalance } from '../lib/contracts';
import { MIN_LIQUIDITY_ETH, MIN_LIQUIDITY_PERCENT, RECOMMENDED_LIQUIDITY_PERCENT, TOTAL_SUPPLY, MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH } from '../contracts/addresses';
import { formatNumber } from '../lib/utils';
import { LaunchCelebration } from '../components/LaunchCelebration';
import { ToastMessage } from '../App';

interface LaunchProps {
  onNavigate: (page: string, tokenAddress?: string) => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function Launch({ onNavigate, onShowToast }: LaunchProps) {
  const { t } = useTranslation();
  const { account, signer, connect, provider } = useWeb3();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [website, setWebsite] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [liquidityPercent, setLiquidityPercent] = useState(RECOMMENDED_LIQUIDITY_PERCENT);
  const [ethAmount, setEthAmount] = useState(MIN_LIQUIDITY_ETH);

  const [ethBalance, setEthBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    tokenAddress: string;
    ammAddress: string;
    txHash: string;
    tokenName: string;
    tokenSymbol: string;
  } | null>(null);

  const tokensToLiquidity = (TOTAL_SUPPLY * liquidityPercent) / 100;
  const tokensToCreator = TOTAL_SUPPLY - tokensToLiquidity;

  useEffect(() => {
    const fetchBalance = async () => {
      if (account && provider) {
        setIsLoadingBalance(true);
        try {
          const balance = await getETHBalance(provider, account);
          setEthBalance(balance);
        } catch (err) {
          console.error('Failed to fetch balance:', err);
        } finally {
          setIsLoadingBalance(false);
        }
      } else {
        setEthBalance('0');
      }
    };

    fetchBalance();
  }, [account, provider]);

  const totalEthNeeded = parseFloat(ethAmount);
  const hasInsufficientBalance = !!(account && parseFloat(ethBalance) < totalEthNeeded);
  const balanceShortfall = hasInsufficientBalance
    ? (totalEthNeeded - parseFloat(ethBalance)).toFixed(4)
    : '0';

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

    if (name.trim().length > MAX_NAME_LENGTH) {
      setError(`Token name must be ${MAX_NAME_LENGTH} characters or less`);
      return;
    }

    if (symbol.trim().length > MAX_SYMBOL_LENGTH) {
      setError(`Token symbol must be ${MAX_SYMBOL_LENGTH} characters or less`);
      return;
    }

    if (parseFloat(ethAmount) < parseFloat(MIN_LIQUIDITY_ETH)) {
      setError(t('launch.errors.minLiquidity', { min: MIN_LIQUIDITY_ETH }));
      return;
    }

    if (hasInsufficientBalance) {
      setError(
        t('launch.errors.insufficientBalance', {
          balance: parseFloat(ethBalance).toFixed(4),
          needed: totalEthNeeded.toFixed(4),
          shortfall: balanceShortfall,
        })
      );
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

      const { supabase } = await import('../lib/supabase');
      const { getEthPriceUSD } = await import('../lib/ethPrice');

      const tokenReserve = ((TOTAL_SUPPLY * liquidityPercent) / 100).toString();
      const ethReserve = ethAmount;

      const normalizedTokenAddress = result.tokenAddress.toLowerCase();
      const normalizedAmmAddress = result.ammAddress.toLowerCase();

      await supabase
        .from('tokens')
        .upsert({
          token_address: normalizedTokenAddress,
          amm_address: normalizedAmmAddress,
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          creator_address: account.toLowerCase(),
          liquidity_percent: liquidityPercent,
          initial_liquidity_eth: ethAmount,
          current_eth_reserve: ethReserve,
          current_token_reserve: tokenReserve,
          total_volume_eth: '0',
          website: website.trim() || null,
          telegram_url: telegramUrl.trim() || null,
          discord_url: discordUrl.trim() || null,
          x_url: xUrl.trim() || null,
          created_at: new Date().toISOString(),
          block_number: result.blockNumber,
          block_hash: result.blockHash,
        }, {
          onConflict: 'token_address',
        });

      const priceEth = parseFloat(ethReserve) / parseFloat(tokenReserve);
      const ethPriceUsd = await getEthPriceUSD();

      await supabase
        .from('price_snapshots')
        .insert({
          token_address: normalizedTokenAddress,
          price_eth: priceEth.toString(),
          eth_reserve: ethReserve,
          token_reserve: tokenReserve,
          eth_price_usd: ethPriceUsd.toString(),
        });

      setSuccess({
        tokenAddress: normalizedTokenAddress,
        ammAddress: normalizedAmmAddress,
        txHash: result.txHash,
        tokenName: name.trim(),
        tokenSymbol: symbol.trim().toUpperCase(),
      });
      setName('');
      setSymbol('');
      setWebsite('');
      setTelegramUrl('');
      setDiscordUrl('');
      setXUrl('');
      setLiquidityPercent(RECOMMENDED_LIQUIDITY_PERCENT);
      setEthAmount(MIN_LIQUIDITY_ETH);
    } catch (err: any) {
      console.error('Failed to launch token:', err);

      if (err.code === 'INSUFFICIENT_FUNDS' || err.message?.includes('insufficient funds')) {
        setError(t('launch.errors.insufficientFunds'));
      } else if (err.code === 'ACTION_REJECTED' || err.message?.includes('user rejected')) {
        setError(t('launch.errors.userRejected'));
      } else if (err.message?.includes('gas')) {
        setError(t('launch.errors.gasError', { message: err.message }));
      } else {
        setError(err.message || t('launch.errors.generic'));
      }
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <>
      {success && (
        <LaunchCelebration
          tokenName={success.tokenName}
          tokenSymbol={success.tokenSymbol}
          tokenAddress={success.tokenAddress}
          ammAddress={success.ammAddress}
          txHash={success.txHash}
          onClose={() => setSuccess(null)}
          onViewToken={() => onNavigate('token-detail', success.tokenAddress)}
          onShowToast={onShowToast}
        />
      )}

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-6 sm:py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-gray-900 p-2 rounded-lg">
                <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('launch.title')}</h1>
            </div>

          {error && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">{error}</p>
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
                maxLength={MAX_NAME_LENGTH}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                disabled={isLaunching}
              />
              <p className="text-xs mt-1 text-gray-500">
                {name.length}/{MAX_NAME_LENGTH} {t(`common.${name.length === 1 ? 'character' : 'characters'}`)}
              </p>
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
                maxLength={MAX_SYMBOL_LENGTH}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent uppercase"
                disabled={isLaunching}
              />
              <p className="text-xs mt-1 text-gray-500">
                {symbol.length}/{MAX_SYMBOL_LENGTH} {t(`common.${symbol.length === 1 ? 'character' : 'characters'}`)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourtoken.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                disabled={isLaunching}
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Social Media Links <span className="text-gray-400 font-normal">(Optional)</span></h3>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Telegram
                </label>
                <input
                  type="url"
                  value={telegramUrl}
                  onChange={(e) => setTelegramUrl(e.target.value)}
                  placeholder="https://t.me/yourchannel"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  disabled={isLaunching}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Discord
                </label>
                <input
                  type="url"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  placeholder="https://discord.gg/yourserver"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  disabled={isLaunching}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  X (Twitter)
                </label>
                <input
                  type="url"
                  value={xUrl}
                  onChange={(e) => setXUrl(e.target.value)}
                  placeholder="https://x.com/yourhandle"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  disabled={isLaunching}
                />
              </div>
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
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t('launch.form.initialLiquidity')}
                </label>
                {account && (
                  <div className={`flex items-center space-x-1 text-sm ${hasInsufficientBalance ? 'text-blue-600' : 'text-gray-600'}`}>
                    <Wallet className="w-4 h-4" />
                    <span>
                      {isLoadingBalance ? (
                        t('launch.form.loadingBalance')
                      ) : (
                        <>
                          {parseFloat(ethBalance).toFixed(4)} ETH
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
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
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                  hasInsufficientBalance
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-300'
                }`}
                disabled={isLaunching}
              />
              {hasInsufficientBalance && (
                <div className="mt-2 flex items-start space-x-2 text-sm text-blue-600">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('launch.form.insufficientBalance')}</p>
                    <p className="text-xs text-blue-500 mt-1">
                      {t('launch.form.needMore', { amount: balanceShortfall })}
                    </p>
                  </div>
                </div>
              )}
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
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-900">{t('launch.form.initialLiq')}</span>
                  <span className="text-gray-900">{ethAmount} {t('common.eth')}</span>
                </div>
              </div>
            </div>

            {hasInsufficientBalance && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">{t('launch.form.getEthTitle')}</p>
                    <p className="text-xs">{t('launch.form.getEthDescription')}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleLaunch}
              disabled={isLaunching || !signer || hasInsufficientBalance}
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
              </ul>
            </div>
          </div>
          </div>
        </div>
      </div>
    </>
  );
}
