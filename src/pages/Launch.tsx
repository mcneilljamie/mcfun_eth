import { useState, useEffect } from 'react';
import { Rocket, AlertCircle, Loader, Wallet, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWeb3 } from '../lib/web3';
import { createToken, getETHBalance } from '../lib/contracts';
import { getMinLiquidityETH, MIN_LIQUIDITY_PERCENT, RECOMMENDED_LIQUIDITY_PERCENT, TOTAL_SUPPLY, MAX_NAME_LENGTH, MAX_SYMBOL_LENGTH, DEFAULT_CHAIN_ID, SUPPORTED_CHAIN_IDS, getNetworkShortName, isChainSupported } from '../contracts/addresses';
import { formatNumber } from '../lib/utils';
import { LaunchCelebration } from '../components/LaunchCelebration';
import { ToastMessage } from '../App';

interface LaunchProps {
  onNavigate: (page: string, tokenAddress?: string) => void;
  onShowToast: (toast: ToastMessage) => void;
}

export function Launch({ onNavigate, onShowToast }: LaunchProps) {
  const { t } = useTranslation();
  const { account, signer, connect, provider, chainId, switchNetwork } = useWeb3();

  const [selectedChainId, setSelectedChainId] = useState<number>(() => {
    const saved = localStorage.getItem('mcfun_launch_chain');
    return saved ? parseInt(saved) : DEFAULT_CHAIN_ID;
  });

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [website, setWebsite] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [discordUrl, setDiscordUrl] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [liquidityPercent, setLiquidityPercent] = useState(RECOMMENDED_LIQUIDITY_PERCENT);

  const minLiquidityETH = getMinLiquidityETH(selectedChainId);
  const [ethAmount, setEthAmount] = useState(minLiquidityETH);

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
    tokenNumber: number;
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

  useEffect(() => {
    setEthAmount(minLiquidityETH);
  }, [minLiquidityETH]);

  useEffect(() => {
    localStorage.setItem('mcfun_launch_chain', selectedChainId.toString());
  }, [selectedChainId]);

  const handleChainSelect = async (targetChainId: number) => {
    setSelectedChainId(targetChainId);

    if (account && chainId !== targetChainId) {
      try {
        await switchNetwork(targetChainId);
        onShowToast({
          type: 'success',
          message: `Switched to ${getNetworkShortName(targetChainId)}`
        });
      } catch (err) {
        console.error('Failed to switch network:', err);
        onShowToast({
          type: 'error',
          message: `Failed to switch to ${getNetworkShortName(targetChainId)}. Please switch manually in your wallet.`
        });
      }
    }
  };

  const isWalletOnCorrectChain = !account || chainId === selectedChainId;

  const totalEthNeeded = parseFloat(ethAmount);
  const hasInsufficientBalance = !!(account && parseFloat(ethBalance) < totalEthNeeded);
  const balanceShortfall = hasInsufficientBalance
    ? (totalEthNeeded - parseFloat(ethBalance)).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    : '0';

  const handleLaunch = async () => {
    if (!signer || !account) {
      connect();
      return;
    }

    if (!isWalletOnCorrectChain) {
      try {
        await switchNetwork(selectedChainId);
        onShowToast({
          type: 'success',
          message: `Switched to ${getNetworkShortName(selectedChainId)}`
        });
      } catch (err) {
        setError(`Please switch your wallet to ${getNetworkShortName(selectedChainId)} network to launch on this blockchain.`);
        return;
      }
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

    if (parseFloat(ethAmount) < parseFloat(minLiquidityETH)) {
      setError(t('launch.errors.minLiquidity', { min: minLiquidityETH }));
      return;
    }

    if (hasInsufficientBalance) {
      setError(
        t('launch.errors.insufficientBalance', {
          balance: parseFloat(ethBalance).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
          needed: totalEthNeeded.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
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

      const normalizedTokenAddress = result.tokenAddress.toLowerCase();
      const normalizedAmmAddress = result.ammAddress.toLowerCase();

      // Fetch the total token count from database
      let tokenNumber = 0;
      try {
        const { supabase } = await import('../lib/supabase');
        const { count } = await supabase
          .from('tokens')
          .select('*', { count: 'exact', head: true });
        tokenNumber = (count || 0) + 1;
      } catch (err) {
        console.error('Failed to fetch token count:', err);
      }

      // Show success immediately after blockchain confirmation
      setSuccess({
        tokenAddress: normalizedTokenAddress,
        ammAddress: normalizedAmmAddress,
        txHash: result.txHash,
        tokenName: name.trim(),
        tokenSymbol: symbol.trim().toUpperCase(),
        tokenNumber,
      });

      setName('');
      setSymbol('');
      setWebsite('');
      setTelegramUrl('');
      setDiscordUrl('');
      setXUrl('');
      setLiquidityPercent(RECOMMENDED_LIQUIDITY_PERCENT);
      setEthAmount(minLiquidityETH);

      // Register token through secure validation endpoint (non-blocking)
      (async () => {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const registrationData = {
            txHash: result.txHash,
            tokenAddress: normalizedTokenAddress,
            ammAddress: normalizedAmmAddress,
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            website: website.trim() || undefined,
            telegramUrl: telegramUrl.trim() || undefined,
            discordUrl: discordUrl.trim() || undefined,
            xUrl: xUrl.trim() || undefined,
          };

          console.log('Registering token through validation endpoint:', registrationData);

          const response = await fetch(`${supabaseUrl}/functions/v1/register-token-launch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify(registrationData),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Token registration validation failed:', errorData);

            // Log the error but don't interrupt user experience
            // The event indexer will pick it up as a backup
            console.warn('Token will be indexed by the event indexer as backup');
          } else {
            const result = await response.json();
            console.log('Token successfully registered and validated:', result);
          }
        } catch (bgError) {
          console.error('Token registration request failed:', bgError);
          console.warn('Token will be indexed by the event indexer as backup');
        }
      })();
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

  if (!account) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <Rocket className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('launch.connectWallet')}</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {t('launch.connectWalletDescription')}
          </p>
          <button
            onClick={() => onNavigate('tokens')}
            className="px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Explore Tokens
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {success && (
        <LaunchCelebration
          tokenName={success.tokenName}
          tokenSymbol={success.tokenSymbol}
          tokenAddress={success.tokenAddress}
          ammAddress={success.ammAddress}
          txHash={success.txHash}
          tokenNumber={success.tokenNumber}
          onClose={() => setSuccess(null)}
          onViewToken={() => onNavigate('token-detail', success.tokenAddress)}
          onShowToast={onShowToast}
        />
      )}

      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-6 sm:py-12 transition-colors">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 sm:p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-gray-900 p-2 rounded-lg">
                <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('launch.title')}</h1>
            </div>

          {error && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-300">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Blockchain
              </label>
              <div className="grid grid-cols-2 gap-3">
                {SUPPORTED_CHAIN_IDS.map((chainId) => (
                  <button
                    key={chainId}
                    type="button"
                    onClick={() => handleChainSelect(chainId)}
                    disabled={isLaunching}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      selectedChainId === chainId
                        ? 'border-gray-900 dark:border-gray-400 bg-gray-50 dark:bg-gray-700'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    } ${isLaunching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex flex-col items-start">
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {getNetworkShortName(chainId)}
                        </span>
                        {selectedChainId === chainId && (
                          <div className="w-5 h-5 bg-gray-900 dark:bg-gray-400 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white dark:bg-gray-800 rounded-full"></div>
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Min: {getMinLiquidityETH(chainId)} ETH
                      </span>
                    </div>
                    {account && chainId !== selectedChainId && chainId === selectedChainId && (
                      <div className="mt-2 text-xs text-blue-600">
                        Click to switch network
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('launch.form.tokenName')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('launch.form.tokenNamePlaceholder')}
                maxLength={MAX_NAME_LENGTH}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                disabled={isLaunching}
              />
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                {name.length}/{MAX_NAME_LENGTH} {t(`common.${name.length === 1 ? 'character' : 'characters'}`)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('launch.form.tokenSymbol')}
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder={t('launch.form.tokenSymbolPlaceholder')}
                maxLength={MAX_SYMBOL_LENGTH}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent uppercase bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                disabled={isLaunching}
              />
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                {symbol.length}/{MAX_SYMBOL_LENGTH} {t(`common.${symbol.length === 1 ? 'character' : 'characters'}`)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Website <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourtoken.com"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                disabled={isLaunching}
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Social Media Links <span className="text-gray-400 dark:text-gray-500 font-normal">(Optional)</span></h3>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Telegram
                </label>
                <input
                  type="url"
                  value={telegramUrl}
                  onChange={(e) => setTelegramUrl(e.target.value)}
                  placeholder="https://t.me/yourchannel"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  disabled={isLaunching}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Discord
                </label>
                <input
                  type="url"
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  placeholder="https://discord.gg/yourserver"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  disabled={isLaunching}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  X (Twitter)
                </label>
                <input
                  type="url"
                  value={xUrl}
                  onChange={(e) => setXUrl(e.target.value)}
                  placeholder="https://x.com/yourhandle"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  disabled={isLaunching}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('launch.form.liquidityAllocation', { percent: liquidityPercent })}
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {t('launch.form.liquidityNote', { min: MIN_LIQUIDITY_PERCENT, recommended: RECOMMENDED_LIQUIDITY_PERCENT })}
              </p>
              <input
                type="range"
                min={MIN_LIQUIDITY_PERCENT}
                max="100"
                value={liquidityPercent}
                onChange={(e) => setLiquidityPercent(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-900"
                disabled={isLaunching}
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{MIN_LIQUIDITY_PERCENT}%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('launch.form.initialLiquidity')}
                </label>
                {account && (
                  <div className={`flex items-center space-x-1 text-sm ${hasInsufficientBalance ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    <Wallet className="w-4 h-4" />
                    <span>
                      {isLoadingBalance ? (
                        t('launch.form.loadingBalance')
                      ) : (
                        <>
                          {parseFloat(ethBalance).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETH
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {t('launch.form.liquidityWarning', { min: minLiquidityETH })}
              </p>
              <input
                type="number"
                step="0.01"
                min={minLiquidityETH}
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder={minLiquidityETH}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-transparent ${
                  hasInsufficientBalance
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-white'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
                } placeholder:text-gray-400 dark:placeholder:text-gray-500`}
                disabled={isLaunching}
              />
              {hasInsufficientBalance && (
                <div className="mt-2 flex items-start space-x-2 text-sm text-blue-600 dark:text-blue-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('launch.form.insufficientBalance')}</p>
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                      {t('launch.form.needMore', { amount: balanceShortfall })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">{t('launch.form.distribution')}</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t('launch.form.totalSupply')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatNumber(TOTAL_SUPPLY)} {t('common.tokens')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t('launch.form.toLiquidity')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatNumber(tokensToLiquidity)} {t('common.tokens')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t('launch.form.toWallet')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatNumber(tokensToCreator)} {t('common.tokens')}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700/50 pt-2 mt-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-900 dark:text-white">{t('launch.form.initialLiq')}</span>
                  <span className="text-gray-900 dark:text-white">{ethAmount} {t('common.eth')}</span>
                </div>
              </div>
            </div>

            {hasInsufficientBalance && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-300">
                    <p className="font-medium mb-1">{t('launch.form.getEthTitle')}</p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400">{t('launch.form.getEthDescription')}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleLaunch}
              disabled={isLaunching || !signer || hasInsufficientBalance}
              className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:text-gray-200 dark:disabled:text-gray-400 flex items-center justify-center space-x-2 touch-manipulation"
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

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg p-3 sm:p-4">
              <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2 text-sm sm:text-base">{t('launch.notes.title')}</h4>
              <ul className="text-xs sm:text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
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
