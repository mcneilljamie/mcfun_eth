import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { Loader2, Lock as LockIcon, Clock, Wallet, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WithdrawSuccess } from '../components/WithdrawSuccess';
import { ToastMessage } from '../App';
import { getExplorerUrl, getLockerAddress } from '../contracts/addresses';
import { TOKEN_LOCKER_ABI } from '../contracts/abis';

interface TokenLock {
  id: string;
  lock_id: number;
  user_address: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_decimals: number;
  amount_locked: string;
  amount_locked_formatted: number;
  lock_duration_days: number;
  lock_timestamp: string;
  unlock_timestamp: string;
  is_withdrawn: boolean;
  tx_hash: string;
  value_eth?: number;
  value_usd?: number;
  current_price_eth?: number;
  current_price_usd?: number;
}

interface MyLocksProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function MyLocks({ onShowToast }: MyLocksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { account, signer, chainId } = useWeb3();
  const [loading, setLoading] = useState(true);
  const [userLocks, setUserLocks] = useState<TokenLock[]>([]);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<{
    txHash: string;
    tokenSymbol: string;
    amount: string;
  } | null>(null);

  useEffect(() => {
    if (account) {
      loadUserLocks();
    } else {
      setLoading(false);
    }
  }, [account]);

  const loadUserLocks = async () => {
    if (!account) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_user_locked_tokens', {
        user_addr: account
      });

      if (error) {
        console.error('Error loading user locks:', error);
        onShowToast({
          message: t('myLocks.errors.failedToLoad'),
          type: 'error'
        });
      } else if (data) {
        setUserLocks(data);
      }
    } catch (err) {
      console.error('Failed to load user locks:', err);
      onShowToast({
        message: t('myLocks.errors.failedToLoad'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

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

    const now = new Date();
    const unlockDate = new Date(lock.unlock_timestamp);
    if (now < unlockDate) {
      onShowToast({
        message: t('myLocks.errors.lockNotEnded'),
        type: 'error'
      });
      return;
    }

    try {
      setWithdrawing(lock.id);
      const lockerContract = new ethers.Contract(lockerAddress, TOKEN_LOCKER_ABI, signer);

      const tx = await lockerContract.withdraw(lock.lock_id);
      onShowToast({
        message: t('myLocks.toasts.withdrawSubmitted'),
        type: 'info'
      });

      const receipt = await tx.wait();

      const formattedAmount = ethers.formatUnits(lock.amount_locked, lock.token_decimals);
      setWithdrawSuccess({
        txHash: receipt.hash,
        tokenSymbol: lock.token_symbol,
        amount: parseFloat(formattedAmount).toFixed(4),
      });

      await loadUserLocks();
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

  const formatTimeRemaining = (unlockTimestamp: string) => {
    const now = new Date();
    const unlock = new Date(unlockTimestamp);
    const diff = unlock.getTime() - now.getTime();

    if (diff <= 0) {
      return t('myLocks.readyToUnlock');
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

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

  const activeLocks = userLocks
    .filter(lock => !lock.is_withdrawn)
    .sort((a, b) => new Date(a.unlock_timestamp).getTime() - new Date(b.unlock_timestamp).getTime());
  const withdrawnLocks = userLocks.filter(lock => lock.is_withdrawn);

  const totalLockedValue = activeLocks.reduce((sum, lock) => sum + (lock.value_usd || 0), 0);

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
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 mb-8 text-white">
            <div className="text-sm text-blue-100 mb-2">{t('myLocks.totalLockedValue')}</div>
            <div className="text-4xl font-bold">{formatCurrency(totalLockedValue)}</div>
            <div className="text-sm text-blue-100 mt-2">{activeLocks.length} {activeLocks.length === 1 ? t('myLocks.activeLock') : t('myLocks.activeLocks')}</div>
          </div>

          <div className="space-y-4">
            {activeLocks.map((lock) => {
              const now = new Date();
              const unlockDate = new Date(lock.unlock_timestamp);
              const lockDate = new Date(lock.lock_timestamp);
              const isUnlockable = now >= unlockDate;
              const timeRemaining = unlockDate.getTime() - now.getTime();
              const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

              return (
                <div
                  key={lock.id}
                  className="bg-white rounded-xl border-2 border-gray-200 p-6 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-gray-900">{lock.token_symbol}</h3>
                        <span className="text-sm text-gray-500">{lock.token_name}</span>
                        {isUnlockable && (
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {t('myLocks.readyToUnlock')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => navigate(`/lock/${lock.token_address}`)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {t('myLocks.viewAllForToken')}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-900 mb-1">
                        {formatCurrency(lock.value_usd || 0)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatAmount(lock.amount_locked_formatted)} {lock.token_symbol}
                      </div>
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
                        {formatDuration(lock.lock_duration_days)}
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
                          {formatTimeRemaining(lock.unlock_timestamp)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <a
                      href={`${getExplorerUrl(chainId || 1)}/tx/${lock.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      {t('myLocks.viewTransaction')}
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    {isUnlockable && (
                      <button
                        onClick={() => handleWithdraw(lock)}
                        disabled={withdrawing === lock.id}
                        className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {withdrawing === lock.id ? (
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
                    key={lock.id}
                    className="bg-gray-50 rounded-lg border border-gray-200 p-4 opacity-75"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {formatAmount(lock.amount_locked_formatted)} {lock.token_symbol}
                        </div>
                        <div className="text-sm text-gray-500">
                          {t('myLocks.lockedFor')} {formatDuration(lock.lock_duration_days)} • {t('myLocks.withdrawn')}
                        </div>
                      </div>
                      <a
                        href={`${getExplorerUrl(chainId || 1)}/tx/${lock.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {t('myLocks.viewTransaction')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
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
