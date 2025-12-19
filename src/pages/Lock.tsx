import { useState, useEffect } from 'react';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { Loader2, Lock as LockIcon, Search, Clock, User, Coins, AlertCircle, ExternalLink, TrendingUp, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LockCelebration } from '../components/LockCelebration';
import { ToastMessage } from '../App';
import { getExplorerUrl, getLockerAddress } from '../contracts/addresses';
import { ERC20_ABI, TOKEN_LOCKER_ABI } from '../contracts/abis';

interface TokenLock {
  id: string;
  lock_id: number;
  user_address: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_decimals: number;
  amount_locked: string;
  lock_duration_days: number;
  lock_timestamp: string;
  unlock_timestamp: string;
  is_withdrawn: boolean;
  tx_hash: string;
}

interface AggregatedLock {
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_decimals: number;
  total_amount_locked: string;
  lock_count: number;
  current_price_eth: number;
  current_price_usd: number;
  total_value_eth: number;
  total_value_usd: number;
}

interface LockPageProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function Lock({ onShowToast }: LockPageProps) {
  const { t } = useTranslation();
  const { account, provider, signer, chainId } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [allLocks, setAllLocks] = useState<TokenLock[]>([]);
  const [aggregatedLocks, setAggregatedLocks] = useState<AggregatedLock[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number; balance: string } | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const [celebration, setCelebration] = useState<{
    lockId: number;
    tokenSymbol: string;
    tokenName: string;
    tokenAddress: string;
    amountLocked: string;
    durationDays: number;
    unlockDate: Date;
    txHash: string;
  } | null>(null);

  useEffect(() => {
    loadLocks();
    loadAggregatedLocks();
  }, []);

  useEffect(() => {
    if (tokenAddress && ethers.isAddress(tokenAddress) && provider) {
      loadTokenInfo();
    } else {
      setTokenInfo(null);
      setNeedsApproval(false);
    }
  }, [tokenAddress, provider, account]);

  useEffect(() => {
    if (tokenInfo && amount && parseFloat(amount) > 0 && account && provider) {
      checkAllowance();
    } else {
      setNeedsApproval(false);
    }
  }, [tokenInfo, amount, account, provider]);

  const loadLocks = async () => {
    try {
      const { data, error } = await supabase
        .from('token_locks')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAllLocks(data);
      }
    } catch (err) {
      console.error('Failed to load locks:', err);
    }
  };

  const loadAggregatedLocks = async () => {
    try {
      const { data, error } = await supabase.rpc('get_aggregated_locks_by_token');

      if (!error && data) {
        setAggregatedLocks(data);
      }
    } catch (err) {
      console.error('Failed to load aggregated locks:', err);
    }
  };

  const loadTokenInfo = async () => {
    if (!provider || !account) return;

    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [name, symbol, decimals, balance] = await Promise.all([
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.balanceOf(account),
      ]);

      setTokenInfo({
        name,
        symbol,
        decimals: Number(decimals),
        balance: ethers.formatUnits(balance, decimals),
      });
    } catch (err) {
      console.error('Failed to load token info:', err);
      setTokenInfo(null);
      onShowToast({
        message: t('lock.errors.invalidToken'),
        type: 'error',
      });
    }
  };

  const checkAllowance = async () => {
    if (!provider || !account || !tokenInfo || !amount || !chainId) return;

    try {
      const lockerAddress = getLockerAddress(chainId);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const allowance = await tokenContract.allowance(account, lockerAddress);
      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals);
      setNeedsApproval(allowance < amountWei);
    } catch (err) {
      console.error('Failed to check allowance:', err);
    }
  };

  const handleApprove = async () => {
    if (!signer || !tokenInfo || !amount || !chainId) return;

    try {
      setIsApproving(true);
      const lockerAddress = getLockerAddress(chainId);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals);

      const tx = await tokenContract.approve(lockerAddress, amountWei);
      onShowToast({
        message: t('lock.approving'),
        type: 'info',
      });

      await tx.wait();
      setNeedsApproval(false);

      onShowToast({
        message: t('lock.approved'),
        type: 'success',
      });
    } catch (err: any) {
      console.error('Approval failed:', err);
      onShowToast({
        message: err.message || t('lock.errors.approvalFailed'),
        type: 'error',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleLock = async () => {
    if (!signer || !tokenInfo || !amount || !duration || !chainId) return;

    const amountNum = parseFloat(amount);
    const durationNum = parseInt(duration);

    if (amountNum <= 0 || durationNum <= 0) {
      onShowToast({
        message: t('lock.errors.invalidInput'),
        type: 'error',
      });
      return;
    }

    if (amountNum > parseFloat(tokenInfo.balance)) {
      onShowToast({
        message: t('lock.errors.insufficientBalance'),
        type: 'error',
      });
      return;
    }

    try {
      setIsLocking(true);
      const lockerAddress = getLockerAddress(chainId);
      const lockerContract = new ethers.Contract(lockerAddress, TOKEN_LOCKER_ABI, signer);
      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals);

      const tx = await lockerContract.lockTokens(tokenAddress, amountWei, durationNum);
      onShowToast({
        message: t('lock.locking'),
        type: 'info',
      });

      const receipt = await tx.wait();

      const lockEvent = receipt.logs
        .map((log: any) => {
          try {
            return lockerContract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === 'TokensLocked');

      if (lockEvent) {
        const lockId = Number(lockEvent.args[0]);
        const unlockTime = Number(lockEvent.args[4]);
        const unlockDate = new Date(unlockTime * 1000);

        setCelebration({
          lockId,
          tokenSymbol: tokenInfo.symbol,
          tokenName: tokenInfo.name,
          tokenAddress,
          amountLocked: amount,
          durationDays: durationNum,
          unlockDate,
          txHash: receipt.hash,
        });

        setTokenAddress('');
        setAmount('');
        setDuration('');
        setTokenInfo(null);

        setTimeout(() => {
          loadLocks();
          loadAggregatedLocks();
        }, 2000);
      }
    } catch (err: any) {
      console.error('Lock failed:', err);
      onShowToast({
        message: err.message || t('lock.errors.lockFailed'),
        type: 'error',
      });
    } finally {
      setIsLocking(false);
    }
  };

  const handleUnlock = async (lockId: number) => {
    if (!signer || !chainId) return;

    try {
      setLoading(true);
      const lockerAddress = getLockerAddress(chainId);
      const lockerContract = new ethers.Contract(lockerAddress, TOKEN_LOCKER_ABI, signer);

      const tx = await lockerContract.unlockTokens(lockId);
      onShowToast({
        message: t('lock.unlocking'),
        type: 'info',
      });

      await tx.wait();
      onShowToast({
        message: t('lock.unlocked'),
        type: 'success',
      });

      setTimeout(() => {
        loadLocks();
        loadAggregatedLocks();
      }, 2000);
    } catch (err: any) {
      console.error('Unlock failed:', err);
      onShowToast({
        message: err.message || t('lock.errors.unlockFailed'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredLocks = allLocks.filter((lock) => {
    if (showActiveOnly && (lock.is_withdrawn || new Date(lock.unlock_timestamp) < new Date())) {
      return false;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        lock.token_symbol.toLowerCase().includes(query) ||
        lock.token_name.toLowerCase().includes(query) ||
        lock.token_address.toLowerCase().includes(query) ||
        lock.user_address.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const userLocks = account
    ? filteredLocks.filter((lock) => lock.user_address.toLowerCase() === account.toLowerCase())
    : [];

  const formatTimeRemaining = (unlockTimestamp: string) => {
    const now = new Date();
    const unlock = new Date(unlockTimestamp);
    const diff = unlock.getTime() - now.getTime();

    if (diff <= 0) {
      return t('lock.unlocked');
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days} ${t('lock.days')} ${hours} ${t('lock.hours')}`;
    }
    return `${hours} ${t('lock.hours')}`;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    } else if (num >= 1) {
      return num.toFixed(2);
    } else {
      return num.toFixed(6);
    }
  };

  const explorerUrl = getExplorerUrl(chainId || 11155111);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('lock.title')}</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('lock.subtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <LockIcon className="w-6 h-6 mr-2" />
              {t('lock.lockTokens')}
            </h2>

            {!account ? (
              <div className="text-center py-12">
                <LockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">{t('lock.connectWallet')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lock.tokenAddress')}
                  </label>
                  <input
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {tokenInfo && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">{t('lock.token')}:</span>
                      <span className="font-semibold text-gray-900">
                        {tokenInfo.name} ({tokenInfo.symbol})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('lock.yourBalance')}:</span>
                      <span className="font-semibold text-gray-900">
                        {parseFloat(tokenInfo.balance).toFixed(4)} {tokenInfo.symbol}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lock.amountToLock')}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    disabled={!tokenInfo}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lock.lockDuration')}
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="30"
                    disabled={!tokenInfo}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <p className="text-sm text-gray-500 mt-1">{t('lock.durationHelp')}</p>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      {t('lock.warning')}
                    </div>
                  </div>
                </div>

                {needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || !tokenInfo || !amount}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isApproving ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {t('lock.approving')}
                      </>
                    ) : (
                      t('lock.approve')
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleLock}
                    disabled={isLocking || !tokenInfo || !amount || !duration}
                    className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isLocking ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {t('lock.locking')}
                      </>
                    ) : (
                      <>
                        <LockIcon className="w-5 h-5 mr-2" />
                        {t('lock.lockButton')}
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl shadow-lg p-6 border-2 border-purple-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('lock.howItWorks')}</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('lock.step1Title')}</h3>
                  <p className="text-sm text-gray-700">{t('lock.step1Description')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('lock.step2Title')}</h3>
                  <p className="text-sm text-gray-700">{t('lock.step2Description')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('lock.step3Title')}</h3>
                  <p className="text-sm text-gray-700">{t('lock.step3Description')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {account && userLocks.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('lock.yourLocks')}</h2>
            <div className="space-y-3">
              {userLocks.map((lock) => {
                const isUnlockable = new Date(lock.unlock_timestamp) <= new Date() && !lock.is_withdrawn;
                return (
                  <div
                    key={lock.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">{lock.token_symbol}</h3>
                          <span className="text-sm text-gray-500">{lock.token_name}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">{t('lock.amount')}:</span>
                            <span className="ml-2 font-semibold">
                              {parseFloat(ethers.formatUnits(lock.amount_locked, lock.token_decimals)).toFixed(4)} {lock.token_symbol}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">{t('lock.timeRemaining')}:</span>
                            <span className="ml-2 font-semibold">
                              {lock.is_withdrawn ? t('lock.withdrawn') : formatTimeRemaining(lock.unlock_timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isUnlockable && (
                        <button
                          onClick={() => handleUnlock(lock.lock_id)}
                          disabled={loading}
                          className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {t('lock.unlock')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('lock.allLocks')}</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">{t('lock.activeOnly')}</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('lock.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {filteredLocks.length === 0 ? (
            <div className="text-center py-12">
              <LockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">{t('lock.noLocks')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.token')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.amount')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.locker')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.duration')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.timeRemaining')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('lock.table.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredLocks.map((lock) => (
                    <tr key={lock.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          <div>
                            <div className="font-semibold text-gray-900">{lock.token_symbol}</div>
                            <div className="text-sm text-gray-500">{lock.token_name}</div>
                          </div>
                          <a
                            href={`${explorerUrl}/token/${lock.token_address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">
                          {parseFloat(ethers.formatUnits(lock.amount_locked, lock.token_decimals)).toFixed(4)}
                        </div>
                        <div className="text-sm text-gray-500">{lock.token_symbol}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm text-gray-900">
                          {lock.user_address.slice(0, 6)}...{lock.user_address.slice(-4)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{lock.lock_duration_days} {t('lock.days')}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">
                          {lock.is_withdrawn ? t('lock.withdrawn') : formatTimeRemaining(lock.unlock_timestamp)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lock.is_withdrawn ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                            {t('lock.withdrawn')}
                          </span>
                        ) : new Date(lock.unlock_timestamp) <= new Date() ? (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {t('lock.unlockable')}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {t('lock.locked')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {aggregatedLocks.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <Trophy className="w-6 h-6 mr-2 text-yellow-500" />
              {t('lock.topLockedTokens')}
            </h2>
            <div className="space-y-3">
              {aggregatedLocks.map((aggLock, index) => (
                <div
                  key={aggLock.token_address}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center space-x-2">
                        {index < 3 && (
                          <Trophy
                            className={`w-5 h-5 ${
                              index === 0
                                ? 'text-yellow-500'
                                : index === 1
                                ? 'text-gray-400'
                                : 'text-amber-700'
                            }`}
                          />
                        )}
                        <span className="font-bold text-gray-500 text-lg">#{index + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-gray-900">{aggLock.token_symbol}</h3>
                          <span className="text-sm text-gray-500">{aggLock.token_name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">{t('lock.totalLocked')}:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {formatNumber(parseFloat(aggLock.total_amount_locked) / Math.pow(10, aggLock.token_decimals))} {aggLock.token_symbol}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">{t('lock.lockCount')}:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {aggLock.lock_count} {t('lock.locks')}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">{t('lock.avgPerLock')}:</span>
                            <span className="ml-2 font-semibold text-gray-900">
                              {formatCurrency(aggLock.total_value_usd / aggLock.lock_count)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm text-gray-500 mb-1">{t('lock.totalValue')}</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(aggLock.total_value_usd)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {aggLock.total_value_eth.toFixed(4)} ETH
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {celebration && (
        <LockCelebration
          {...celebration}
          onClose={() => setCelebration(null)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
