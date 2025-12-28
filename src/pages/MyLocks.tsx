import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { Loader2, Lock as LockIcon, Clock, Wallet, ExternalLink, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WithdrawSuccess } from '../components/WithdrawSuccess';
import { ToastMessage } from '../App';
import { getExplorerUrl, getLockerAddress } from '../contracts/addresses';
import { TOKEN_LOCKER_ABI } from '../contracts/abis';
import { useOnChainLocks, OnChainLock } from '../hooks/useOnChainLocks';
import { useLiveReserves } from '../hooks/useLiveReserves';
import { getEthPriceUSD } from '../lib/ethPrice';

interface TokenLock extends OnChainLock {
  lock_timestamp?: string;
  tx_hash?: string;
  withdraw_tx_hash?: string;
  value_eth?: number;
  value_usd?: number;
  current_price_eth?: number;
  current_price_usd?: number;
  amount_locked_formatted?: number;
  lock_duration_days?: number;
}

interface MyLocksProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function MyLocks({ onShowToast }: MyLocksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { account, signer, chainId, provider } = useWeb3();
  const [withdrawing, setWithdrawing] = useState<number | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<{
    txHash: string;
    tokenSymbol: string;
    amount: string;
  } | null>(null);
  const [ethPriceUsd, setEthPriceUsd] = useState(3000);
  const [enrichedLocks, setEnrichedLocks] = useState<TokenLock[]>([]);
  const [tokenPrices, setTokenPrices] = useState<Map<string, { priceEth: number; priceUsd: number }>>(new Map());

  // Use database as source of truth (indexed from on-chain)
  const [onChainLocks, setOnChainLocks] = useState<OnChainLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load locks from database (indexed from blockchain)
  const loadLocks = async () => {
    if (!account) {
      setOnChainLocks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase.rpc('get_user_locked_tokens', {
        user_addr: account
      });

      if (queryError) throw queryError;

      // Convert database format to OnChainLock format
      const locks: OnChainLock[] = (data || []).map((lock: any) => ({
        lockId: lock.lock_id,
        owner: lock.user_address || account,
        tokenAddress: lock.token_address,
        amount: BigInt(lock.amount_locked),
        unlockTime: Math.floor(new Date(lock.unlock_timestamp).getTime() / 1000),
        withdrawn: lock.is_withdrawn,
        tokenSymbol: lock.token_symbol,
        tokenName: lock.token_name,
        tokenDecimals: lock.token_decimals,
      }));

      setOnChainLocks(locks);
    } catch (err: any) {
      console.error('Failed to load locks from database:', err);
      setError(err.message || 'Failed to load locks');
    } finally {
      setLoading(false);
    }
  };

  const reload = loadLocks;

  // Load locks when account changes
  useEffect(() => {
    loadLocks();
  }, [account]);

  // Subscribe to real-time updates for lock withdrawals
  useEffect(() => {
    if (!account) return;

    const channel = supabase
      .channel('token_locks_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'token_locks',
          filter: `user_address=eq.${account.toLowerCase()}`
        },
        (payload) => {
          console.log('Lock updated:', payload);
          // Reload locks when a withdrawal is detected
          if (payload.new.is_withdrawn) {
            loadLocks();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account]);

  // Load ETH price
  useEffect(() => {
    const loadEthPrice = async () => {
      const price = await getEthPriceUSD();
      setEthPriceUsd(price);
    };
    loadEthPrice();
    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load token prices for each unique token
  useEffect(() => {
    if (!provider || onChainLocks.length === 0) return;

    const loadPrices = async () => {
      const uniqueTokens = new Set(onChainLocks.map(lock => lock.tokenAddress.toLowerCase()));
      const prices = new Map<string, { priceEth: number; priceUsd: number }>();

      // Get token info from database to find AMM addresses
      const { data: tokensData } = await supabase
        .from('tokens')
        .select('token_address, amm_address')
        .in('token_address', Array.from(uniqueTokens));

      if (tokensData) {
        const { useLiveReserves } = await import('../hooks/useLiveReserves');

        for (const tokenData of tokensData) {
          try {
            const reserves = await import('../lib/contracts').then(m =>
              m.getAMMReserves(provider, tokenData.amm_address)
            );
            const priceEth = parseFloat(reserves.reserveETH) / parseFloat(reserves.reserveToken);
            prices.set(tokenData.token_address.toLowerCase(), {
              priceEth,
              priceUsd: priceEth * ethPriceUsd,
            });
          } catch (err) {
            console.error(`Failed to load price for ${tokenData.token_address}:`, err);
          }
        }
      }

      setTokenPrices(prices);
    };

    loadPrices();
    const interval = setInterval(loadPrices, 30000);
    return () => clearInterval(interval);
  }, [provider, onChainLocks, ethPriceUsd]);

  // Enrich on-chain locks with metadata from indexer (non-blocking)
  useEffect(() => {
    const enrichLocks = async () => {
      if (onChainLocks.length === 0) {
        setEnrichedLocks([]);
        return;
      }

      // Try to load metadata from indexer but don't block on it
      let indexerData: any[] = [];
      try {
        const { data } = await supabase
          .from('token_locks')
          .select('lock_id, lock_timestamp, tx_hash, withdraw_tx_hash')
          .in('lock_id', onChainLocks.map(l => l.lockId));

        if (data) {
          indexerData = data;
        }
      } catch (err) {
        console.warn('Failed to load lock metadata from indexer:', err);
      }

      const indexerMap = new Map(indexerData.map(d => [d.lock_id, d]));

      const enriched: TokenLock[] = onChainLocks.map(lock => {
        const metadata = indexerMap.get(lock.lockId);
        const price = tokenPrices.get(lock.tokenAddress.toLowerCase());
        const amountFormatted = lock.tokenDecimals
          ? parseFloat(ethers.formatUnits(lock.amount, lock.tokenDecimals))
          : parseFloat(ethers.formatEther(lock.amount));

        const valueEth = price ? amountFormatted * price.priceEth : undefined;
        const valueUsd = price ? amountFormatted * price.priceUsd : undefined;

        // Calculate duration from unlock time
        const lockTimestamp = metadata?.lock_timestamp ? new Date(metadata.lock_timestamp).getTime() / 1000 : lock.unlockTime - (30 * 24 * 60 * 60); // fallback estimate
        const durationDays = Math.floor((lock.unlockTime - lockTimestamp) / 86400);

        return {
          ...lock,
          lock_timestamp: metadata?.lock_timestamp,
          tx_hash: metadata?.tx_hash,
          withdraw_tx_hash: metadata?.withdraw_tx_hash,
          value_eth: valueEth,
          value_usd: valueUsd,
          current_price_eth: price?.priceEth,
          current_price_usd: price?.priceUsd,
          amount_locked_formatted: amountFormatted,
          lock_duration_days: durationDays,
        };
      });

      setEnrichedLocks(enriched);
    };

    enrichLocks();
  }, [onChainLocks, tokenPrices]);

  const handleWithdraw = async (lock: TokenLock) => {
    if (!signer || !chainId) {
      onShowToast({
        message: t('myLocks.errors.connectWallet'),
        type: 'error'
      });
      return;
    }

    const lockerAddress = getLockerAddress(chainId);
    if (!lockerAddress) {
      onShowToast({
        message: t('myLocks.errors.lockerNotAvailable'),
        type: 'error'
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now < lock.unlockTime) {
      onShowToast({
        message: t('myLocks.errors.lockNotEnded'),
        type: 'error'
      });
      return;
    }

    try {
      setWithdrawing(lock.lockId);
      const lockerContract = new ethers.Contract(lockerAddress, TOKEN_LOCKER_ABI, signer);

      // Check on-chain state before attempting withdrawal
      const lockInfo = await lockerContract.getLock(lock.lockId);
      const isWithdrawnOnChain = lockInfo[4];

      if (isWithdrawnOnChain) {
        onShowToast({
          message: t('myLocks.errors.alreadyWithdrawn'),
          type: 'error'
        });
        setWithdrawing(null);
        // Reload on-chain data to update UI
        await reload();
        return;
      }

      const tx = await lockerContract.unlockTokens(lock.lockId);
      onShowToast({
        message: t('myLocks.toasts.withdrawSubmitted'),
        type: 'info'
      });

      const receipt = await tx.wait();

      const formattedAmount = lock.tokenDecimals
        ? ethers.formatUnits(lock.amount, lock.tokenDecimals)
        : ethers.formatEther(lock.amount);

      setWithdrawSuccess({
        txHash: receipt.hash,
        tokenSymbol: lock.tokenSymbol || 'TOKEN',
        amount: parseFloat(formattedAmount).toFixed(4),
      });

      // Reload on-chain locks immediately after transaction confirms
      await reload();
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      let errorMessage = t('myLocks.errors.withdrawFailed');

      // Check for user rejection in various formats
      const isUserRejection =
        error.code === 'ACTION_REJECTED' ||
        error.code === 4001 ||
        error.code === -32603 ||
        (error.message && (
          error.message.includes('user rejected') ||
          error.message.includes('User denied') ||
          error.message.includes('rejected') ||
          error.message.includes('denied')
        )) ||
        (error.reason && (
          error.reason.includes('user rejected') ||
          error.reason.includes('rejected')
        ));

      if (isUserRejection) {
        errorMessage = t('myLocks.errors.transactionRejected');
      } else if (error.message) {
        // Only show detailed error message if it's not a rejection
        errorMessage = error.message;
      }

      onShowToast({
        message: errorMessage,
        type: 'error'
      });
    } finally {
      setWithdrawing(null);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
    } else {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
    } else if (amount >= 1) {
      return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      return amount.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
  };

  const formatTimeRemaining = (unlockTime: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = unlockTime - now;

    if (diff <= 0) {
      return t('myLocks.readyToUnlock');
    }

    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);

    if (days > 1) {
      return `${days} ${t('myLocks.days')} ${t('myLocks.remaining')}`;
    } else if (days === 1) {
      return `1 ${t('myLocks.day')} ${t('myLocks.remaining')}`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? t('myLocks.hour') : t('myLocks.hours')} ${t('myLocks.remaining')}`;
    } else {
      return `${minutes} ${minutes === 1 ? t('myLocks.minute') : t('myLocks.minutes')} ${t('myLocks.remaining')}`;
    }
  };

  const formatDuration = (days: number) => {
    if (days === 1) {
      return `1 ${t('myLocks.day')}`;
    } else {
      return `${days} ${t('myLocks.days')}`;
    }
  };

  if (!account) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('myLocks.connectWallet')}</h2>
          <p className="text-gray-600">
            {t('myLocks.connectWalletDescription')}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">{t('myLocks.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">{t('myLocks.errors.failedToLoad')}</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const activeLocks = enrichedLocks
    .filter(lock => !lock.withdrawn)
    .sort((a, b) => a.unlockTime - b.unlockTime);
  const withdrawnLocks = enrichedLocks.filter(lock => lock.withdrawn);

  const locksWithPricing = activeLocks.filter(lock => lock.value_usd && lock.value_usd > 0);
  const totalLockedValue = locksWithPricing.reduce((sum, lock) => sum + (lock.value_usd || 0), 0);
  const hasPricingData = locksWithPricing.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
          <LockIcon className="w-8 h-8 mr-3 text-blue-600" />
          {t('myLocks.title')}
        </h1>
        <p className="text-gray-600">
          {t('myLocks.subtitle')}
        </p>
      </div>

      {activeLocks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <LockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('myLocks.noActiveLocks')}</h2>
          <p className="text-gray-600 mb-6">
            {t('myLocks.noLocksDescription')}
          </p>
          <button
            onClick={() => navigate('/lock')}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('myLocks.lockTokensButton')}
          </button>
        </div>
      ) : (
        <>
          {hasPricingData && (
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 mb-8 text-white">
              <div className="text-sm text-blue-100 mb-2">{t('myLocks.totalLockedValue')}</div>
              <div className="text-4xl font-bold">{formatCurrency(totalLockedValue)}</div>
              <div className="text-sm text-blue-100 mt-2">{activeLocks.length} {activeLocks.length === 1 ? t('myLocks.activeLock') : t('myLocks.activeLocks')}</div>
            </div>
          )}

          <div className="space-y-4">
            {activeLocks.map((lock) => {
              const now = Math.floor(Date.now() / 1000);
              const unlockDate = new Date(lock.unlockTime * 1000);
              const lockDate = lock.lock_timestamp ? new Date(lock.lock_timestamp) : new Date((lock.unlockTime - (lock.lock_duration_days || 30) * 86400) * 1000);
              const isUnlockable = now >= lock.unlockTime;

              return (
                <div
                  key={lock.lockId}
                  className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-2xl font-bold text-gray-900 whitespace-nowrap">{lock.tokenSymbol || 'TOKEN'}</h3>
                        <span className="text-sm text-gray-500 break-words">{lock.tokenName || 'Unknown Token'}</span>
                        {isUnlockable && (
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {t('myLocks.readyToUnlock')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/lock/${lock.tokenAddress}`)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {t('myLocks.viewAllForToken')}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-right">
                      {lock.value_usd && lock.value_usd > 0 ? (
                        <>
                          <div className="text-3xl font-bold text-gray-900 mb-1">
                            {formatCurrency(lock.value_usd)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {lock.amount_locked_formatted ? formatAmount(lock.amount_locked_formatted) : '...'} {lock.tokenSymbol || ''}
                          </div>
                        </>
                      ) : (
                        <div className="text-3xl font-bold text-gray-900">
                          {lock.amount_locked_formatted ? formatAmount(lock.amount_locked_formatted) : '...'} {lock.tokenSymbol || 'TOKEN'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">{t('myLocks.lockedOn')}</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {lockDate.toLocaleDateString()}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1">{t('myLocks.lockDuration')}</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {lock.lock_duration_days ? formatDuration(lock.lock_duration_days) : '...'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs text-gray-500 mb-1 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {isUnlockable ? t('myLocks.unlockedOn') : t('myLocks.unlocksOn')}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {unlockDate.toLocaleDateString()}
                      </div>
                      {!isUnlockable && (
                        <div className="text-xs text-gray-500 mt-1">
                          {formatTimeRemaining(lock.unlockTime)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    {lock.tx_hash ? (
                      <a
                        href={`${getExplorerUrl(chainId || 1)}/tx/${lock.withdraw_tx_hash || lock.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {t('myLocks.viewTransaction')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <div className="text-sm text-gray-400">
                        {t('myLocks.viewTransaction')}
                      </div>
                    )}

                    {isUnlockable && (
                      <button
                        onClick={() => handleWithdraw(lock)}
                        disabled={withdrawing === lock.lockId}
                        className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {withdrawing === lock.lockId ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('myLocks.withdrawing')}
                          </>
                        ) : (
                          t('myLocks.withdraw')
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {withdrawnLocks.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-gray-400" />
                {t('myLocks.withdrawnLocks')}
              </h2>
              <div className="space-y-3">
                {withdrawnLocks.map((lock) => (
                  <div
                    key={lock.lockId}
                    className="bg-gray-50 rounded-lg border border-gray-200 p-4 opacity-75"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {lock.amount_locked_formatted ? formatAmount(lock.amount_locked_formatted) : '...'} {lock.tokenSymbol || 'TOKEN'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {t('myLocks.lockedFor')} {lock.lock_duration_days ? formatDuration(lock.lock_duration_days) : '...'} • {t('myLocks.withdrawn')}
                        </div>
                      </div>
                      {lock.tx_hash && (
                        <a
                          href={`${getExplorerUrl(chainId || 1)}/tx/${lock.withdraw_tx_hash || lock.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          {t('myLocks.viewTransaction')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {withdrawSuccess && chainId && (
        <WithdrawSuccess
          isOpen={true}
          onClose={() => setWithdrawSuccess(null)}
          txHash={withdrawSuccess.txHash}
          chainId={chainId}
          tokenSymbol={withdrawSuccess.tokenSymbol}
          amount={withdrawSuccess.amount}
        />
      )}
    </div>
  );
}
