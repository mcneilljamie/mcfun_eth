import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Lock as LockIcon, Clock, Wallet, ExternalLink, AlertCircle, Copy, Check, UnlockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToastMessage } from '../App';
import { getExplorerUrl } from '../contracts/addresses';
import { OnChainLock } from '../hooks/useOnChainLocks';
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

interface WalletLocksProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function WalletLocks({ onShowToast }: WalletLocksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address } = useParams<{ address: string }>();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [ethPriceUsd, setEthPriceUsd] = useState(3000);
  const [enrichedLocks, setEnrichedLocks] = useState<TokenLock[]>([]);
  const [tokenPrices, setTokenPrices] = useState<Map<string, { priceEth: number; priceUsd: number }>>(new Map());

  const [onChainLocks, setOnChainLocks] = useState<OnChainLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load locks from database for the specified wallet
  const loadLocks = async () => {
    if (!address) {
      setOnChainLocks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase.rpc('get_user_locked_tokens', {
        user_addr: address
      });

      if (queryError) throw queryError;

      const locks: OnChainLock[] = (data || []).map((lock: any) => ({
        lockId: lock.lock_id,
        owner: lock.user_address || address,
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

  useEffect(() => {
    loadLocks();
  }, [address]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!address) return;

    const channel = supabase
      .channel('wallet-locks-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'token_locks',
          filter: `user_address=eq.${address}`
        },
        () => {
          loadLocks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [address]);

  // Get ETH price
  useEffect(() => {
    const fetchEthPrice = async () => {
      const price = await getEthPriceUSD();
      setEthPriceUsd(price);
    };
    fetchEthPrice();
  }, []);

  // Use live reserves hook for all unique tokens
  const uniqueTokenAddresses = [...new Set(onChainLocks.map(lock => lock.tokenAddress))];
  const reserves = useLiveReserves(uniqueTokenAddresses);

  // Enrich locks with price data
  useEffect(() => {
    if (onChainLocks.length === 0) {
      setEnrichedLocks([]);
      return;
    }

    const priceMap = new Map<string, { priceEth: number; priceUsd: number }>();

    for (const tokenAddr of uniqueTokenAddresses) {
      const reserve = reserves.get(tokenAddr);
      if (reserve && reserve.tokenReserve > 0n) {
        const priceEth = Number(reserve.ethReserve) / Number(reserve.tokenReserve);
        const priceUsd = priceEth * ethPriceUsd;
        priceMap.set(tokenAddr, { priceEth, priceUsd });
      }
    }

    setTokenPrices(priceMap);

    const enriched = onChainLocks.map(lock => {
      const price = priceMap.get(lock.tokenAddress);
      const amountFormatted = Number(lock.amount) / Math.pow(10, lock.tokenDecimals || 18);

      return {
        ...lock,
        amount_locked_formatted: amountFormatted,
        current_price_eth: price?.priceEth || 0,
        current_price_usd: price?.priceUsd || 0,
        value_eth: price ? amountFormatted * price.priceEth : 0,
        value_usd: price ? amountFormatted * price.priceUsd : 0,
      };
    });

    setEnrichedLocks(enriched);
  }, [onChainLocks, reserves, ethPriceUsd, uniqueTokenAddresses]);

  const activeLocks = enrichedLocks.filter(lock => !lock.withdrawn);
  const withdrawnLocks = enrichedLocks.filter(lock => lock.withdrawn);

  const totalValueUsd = activeLocks.reduce((sum, lock) => sum + (lock.value_usd || 0), 0);

  const formatAmount = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    return amount.toFixed(2);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDuration = (days: number) => {
    if (days >= 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}m`;
    if (days >= 30) return `${Math.floor(days / 30)}mo`;
    return `${days}d`;
  };

  const formatTimeRemaining = (unlockTime: number) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = unlockTime - now;

    if (remaining <= 0) return t('myLocks.unlocked');

    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);

    if (days > 0) return `${days}d ${hours}h ${t('myLocks.remaining')}`;
    return `${hours}h ${t('myLocks.remaining')}`;
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      onShowToast({
        message: t('walletLocks.addressCopied'),
        type: 'success'
      });
    }
  };

  if (!address) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 mb-1">Invalid Address</h3>
            <p className="text-red-700">No wallet address provided.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-4">
          ← {t('walletLocks.backToHome')}
        </Link>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Wallet className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('walletLocks.title')}</h1>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                  {shortenAddress(address)}
                </code>
                <button
                  onClick={handleCopyAddress}
                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title={t('walletLocks.copyAddress')}
                >
                  {copiedAddress ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <a
                  href={`${getExplorerUrl(1)}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title={t('walletLocks.viewOnExplorer')}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-red-900 mb-1">{t('myLocks.loadError')}</h3>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      ) : activeLocks.length === 0 && withdrawnLocks.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-gray-200 p-12 text-center">
          <LockIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('walletLocks.noLocks')}</h2>
          <p className="text-gray-600">{t('walletLocks.noLocksDescription')}</p>
        </div>
      ) : (
        <>
          {activeLocks.length > 0 && (
            <>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 mb-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm opacity-90 mb-1">{t('walletLocks.totalLockedValue')}</div>
                    <div className="text-4xl font-bold">{formatCurrency(totalValueUsd)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm opacity-90 mb-1">{t('walletLocks.activeLocks')}</div>
                    <div className="text-3xl font-bold">{activeLocks.length}</div>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <LockIcon className="w-6 h-6 mr-2 text-blue-600" />
                  {t('walletLocks.activeLocksTitle')}
                </h2>
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
                                  {t('walletLocks.readyToUnlock')}
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
                              href={`${getExplorerUrl(1)}/tx/${lock.withdraw_tx_hash || lock.tx_hash}`}
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {withdrawnLocks.length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-gray-400" />
                {t('walletLocks.withdrawnLocksTitle')}
              </h2>
              <div className="space-y-4">
                {withdrawnLocks.map((lock) => {
                  const unlockDate = new Date(lock.unlockTime * 1000);
                  const lockDate = lock.lock_timestamp ? new Date(lock.lock_timestamp) : new Date((lock.unlockTime - (lock.lock_duration_days || 30) * 86400) * 1000);

                  return (
                    <div
                      key={lock.lockId}
                      className="bg-gray-50 rounded-xl border-2 border-gray-200 p-6 opacity-75"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-xl font-bold text-gray-700 whitespace-nowrap">{lock.tokenSymbol || 'TOKEN'}</h3>
                            <span className="text-sm text-gray-500 break-words">{lock.tokenName || 'Unknown Token'}</span>
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-300 text-gray-700">
                              {t('myLocks.withdrawn')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-gray-700">
                          <div className="text-2xl font-bold">
                            {lock.amount_locked_formatted ? formatAmount(lock.amount_locked_formatted) : '...'} {lock.tokenSymbol || 'TOKEN'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="bg-white rounded-lg p-4">
                          <div className="text-xs text-gray-500 mb-1">{t('myLocks.lockedOn')}</div>
                          <div className="text-sm font-semibold text-gray-700">
                            {lockDate.toLocaleDateString()}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-4">
                          <div className="text-xs text-gray-500 mb-1">{t('myLocks.lockDuration')}</div>
                          <div className="text-sm font-semibold text-gray-700">
                            {lock.lock_duration_days ? formatDuration(lock.lock_duration_days) : '...'}
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-4">
                          <div className="text-xs text-gray-500 mb-1">{t('myLocks.unlockedOn')}</div>
                          <div className="text-sm font-semibold text-gray-700">
                            {unlockDate.toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      {lock.withdraw_tx_hash && (
                        <a
                          href={`${getExplorerUrl(1)}/tx/${lock.withdraw_tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          {t('myLocks.viewWithdrawalTx')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
