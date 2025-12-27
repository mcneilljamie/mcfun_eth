import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { Loader2, Lock as LockIcon, Clock, User, Coins, AlertCircle, ExternalLink, TrendingUp, Trophy, ArrowLeft, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LockCelebration } from '../components/LockCelebration';
import { ToastMessage } from '../App';
import { getExplorerUrl, getLockerAddress, getFactoryAddress } from '../contracts/addresses';
import { ERC20_ABI, TOKEN_LOCKER_ABI, MCFUN_FACTORY_ABI } from '../contracts/abis';

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
  value_eth?: number;
  value_usd?: number;
  current_price_eth?: number;
  current_price_usd?: number;
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
  is_mcfun_token: boolean;
}

interface LockPageProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function Lock({ onShowToast }: LockPageProps) {
  const { t } = useTranslation();
  const { tokenAddress: urlTokenAddress } = useParams<{ tokenAddress: string }>();
  const navigate = useNavigate();
  const { account, provider, signer, chainId } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [allLocks, setAllLocks] = useState<TokenLock[]>([]);
  const [aggregatedLocks, setAggregatedLocks] = useState<AggregatedLock[]>([]);
  const [tokenStats, setTokenStats] = useState<any>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number; balance: string; isMcFunToken: boolean } | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [tokenValidationError, setTokenValidationError] = useState<string | null>(null);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [popularTokens, setPopularTokens] = useState<Array<{ token_address: string; name: string; symbol: string; current_eth_reserve: number }>>([]);

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
    window.scrollTo(0, 0);
    setCurrentPage(1);
    loadLocks(1);
    if (!urlTokenAddress) {
      loadAggregatedLocks();
    } else {
      loadTokenStats();
    }
    loadPopularTokens();
  }, [urlTokenAddress]);

  // Reload locks when page changes
  useEffect(() => {
    loadLocks(currentPage);
  }, [currentPage]);

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

  const loadLocks = async (page = 1) => {
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;

      if (urlTokenAddress) {
        const { data, error } = await supabase.rpc('get_locks_by_token_address_paginated', {
          token_addr: urlTokenAddress,
          page_limit: ITEMS_PER_PAGE,
          page_offset: offset
        });

        if (!error && data && data.length > 0) {
          setAllLocks(data);
          setTotalCount(data[0]?.total_count || 0);
        } else {
          setAllLocks([]);
          setTotalCount(0);
        }
      } else {
        const { data, error } = await supabase.rpc('get_all_locks_with_values_paginated', {
          page_limit: ITEMS_PER_PAGE,
          page_offset: offset
        });

        if (!error && data && data.length > 0) {
          setAllLocks(data);
          setTotalCount(data[0]?.total_count || 0);
        } else {
          setAllLocks([]);
          setTotalCount(0);
        }
      }
    } catch (err) {
      console.error('Failed to load locks:', err);
    }
  };

  const loadTokenStats = async () => {
    if (!urlTokenAddress) return;

    try {
      const { data, error } = await supabase.rpc('get_token_lock_stats', {
        token_addr: urlTokenAddress
      });

      if (!error && data && data.length > 0) {
        setTokenStats(data[0]);
      }
    } catch (err) {
      console.error('Failed to load token stats:', err);
    }
  };

  const loadAggregatedLocks = async () => {
    try {
      // Use cached materialized view for better performance
      const { data, error } = await supabase.rpc('get_aggregated_locks_cached', {
        page_limit: 10,
        page_offset: 0
      });

      if (error) {
        console.error('Supabase error loading aggregated locks:', error);
        return;
      }

      if (data) {
        console.log('Loaded aggregated locks from cache:', data);
        // Filter out any invalid entries
        const validLocks = data.filter((lock: any) =>
          lock &&
          lock.token_address &&
          lock.token_symbol &&
          lock.total_amount_locked
        );
        setAggregatedLocks(validLocks);
      }
    } catch (err) {
      console.error('Failed to load aggregated locks:', err);
    }
  };

  const loadPopularTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('token_address, name, symbol, current_eth_reserve')
        .not('current_eth_reserve', 'is', null)
        .order('current_eth_reserve', { ascending: false })
        .limit(10);

      if (!error && data) {
        console.log('Loaded popular tokens:', data);
        setPopularTokens(data);
      } else {
        console.error('Error loading popular tokens:', error);
      }
    } catch (err) {
      console.error('Failed to load popular tokens:', err);
    }
  };

  const loadTokenInfo = async () => {
    if (!provider || !account || !chainId) return;

    try {
      setTokenValidationError(null);

      // First check if it's a McFun token
      const factoryAddress = getFactoryAddress(chainId);
      const factoryContract = new ethers.Contract(factoryAddress, MCFUN_FACTORY_ABI, provider);
      const ammAddress = await factoryContract.tokenToAMM(tokenAddress);
      const isMcFunToken = ammAddress !== ethers.ZeroAddress;

      if (!isMcFunToken) {
        setTokenInfo(null);
        setTokenValidationError(t('lock.errors.notMcFunToken'));
        return;
      }

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
        isMcFunToken,
      });
    } catch (err) {
      console.error('Failed to load token info:', err);
      setTokenInfo(null);
      setTokenValidationError(t('lock.errors.invalidToken'));
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

      // Approve maximum amount so users only need to approve once
      const tx = await tokenContract.approve(lockerAddress, ethers.MaxUint256);
      onShowToast({
        message: t('lock.approving'),
        type: 'info',
      });

      await tx.wait();

      onShowToast({
        message: t('lock.approved'),
        type: 'success',
      });

      // Re-check allowance to update UI
      await checkAllowance();
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

    if (amountNum <= 0 || durationNum <= 0 || !Number.isInteger(parseFloat(duration))) {
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

        // Reload lock data with a slight delay to allow blockchain to process
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

  const filteredLocks = allLocks
    .filter((lock) => {
      // Filter out withdrawn locks
      return !lock.is_withdrawn;
    })
    .sort((a, b) => {
      // Sort by unlock timestamp (all locks are non-withdrawn due to filter above)
      return new Date(a.unlock_timestamp).getTime() - new Date(b.unlock_timestamp).getTime();
    });

  const topLockedTokens = aggregatedLocks
    .filter(lock => lock.is_mcfun_token)
    .sort((a, b) => (b.total_value_usd || 0) - (a.total_value_usd || 0));

  const formatTimeRemaining = (unlockTimestamp: string) => {
    const now = new Date();
    const unlock = new Date(unlockTimestamp);
    const diff = unlock.getTime() - now.getTime();

    if (diff <= 0) {
      return t('lock.unlocked');
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 1) {
      return `${days} ${t('lock.days')}`;
    } else if (days === 1) {
      return `1 ${t('lock.days').slice(0, -1)}`;
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? t('lock.hours').slice(0, -1) : t('lock.hours')}`;
    } else {
      return `${minutes} ${minutes === 1 ? t('lock.minutes').slice(0, -1) : t('lock.minutes')}`;
    }
  };

  const formatDuration = (days: number) => {
    if (days === 1) {
      return `1 ${t('lock.days').slice(0, -1)}`;
    } else {
      return `${days} ${t('lock.days')}`;
    }
  };

  const getLockStatus = (lock: TokenLock): 'active' | 'unlockable' | 'withdrawn' => {
    if (lock.is_withdrawn) {
      return 'withdrawn';
    }
    const now = new Date();
    const unlock = new Date(lock.unlock_timestamp);
    if (unlock <= now) {
      return 'unlockable';
    }
    return 'active';
  };

  const getStatusBadge = (status: 'active' | 'unlockable' | 'withdrawn') => {
    if (status === 'unlockable') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-200">
          {t('lock.status.unlockable')}
        </span>
      );
    } else if (status === 'active') {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
          {t('lock.status.active')}
        </span>
      );
    } else {
      return (
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
          {t('lock.status.withdrawn')}
        </span>
      );
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

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || !isFinite(num)) {
      return '0';
    }
    if (num >= 1000000) {
      return `${(num / 1000000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}K`;
    } else if (num >= 1) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      return num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
  };

  const formatLargeTokenAmount = (amountText: string | null | undefined, decimals: number): string => {
    try {
      // Validate input
      if (!amountText || amountText === '0' || amountText === '') {
        return '0';
      }

      // Convert text to BigInt safely
      const amountBigInt = BigInt(amountText);

      // Check if amount is zero
      if (amountBigInt === 0n) {
        return '0';
      }

      // Get the divisor for the decimals
      const divisor = BigInt(10 ** decimals);
      // Integer division
      const integerPart = amountBigInt / divisor;
      // Get first 6 decimal places for precision
      const remainder = amountBigInt % divisor;
      const decimalPart = Number(remainder) / Number(divisor);

      // Combine and format
      const total = Number(integerPart) + decimalPart;
      return formatNumber(total);
    } catch (err) {
      console.error('Error formatting large token amount:', err, 'Input:', amountText);
      return '0';
    }
  };

  const safeDivide = (numerator: number | null | undefined, denominator: number | null | undefined): number => {
    // Validate inputs
    if (numerator == null || denominator == null || denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) {
      return 0;
    }
    const result = numerator / denominator;
    return isFinite(result) ? result : 0;
  };

  const explorerUrl = getExplorerUrl(chainId || 11155111);

  const handleShareLock = () => {
    const shareUrl = `${window.location.origin}/lock/${urlTokenAddress}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      onShowToast({
        message: t('lock.shareLinkCopied'),
        type: 'success',
      });
    }).catch(() => {
      onShowToast({
        message: t('lock.shareLinkFailed'),
        type: 'error',
      });
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {urlTokenAddress && tokenStats ? (
          <div className="mb-8">
            <button
              onClick={() => navigate('/lock')}
              className="flex items-center text-blue-600 hover:text-blue-700 mb-4 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              {t('lock.backToAllLocks')}
            </button>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-4xl font-bold mb-2">
                    {tokenStats.token_symbol} {t('lock.locks')}
                  </h1>
                  <p className="text-blue-100 text-lg">{tokenStats.token_name}</p>
                </div>
                <button
                  onClick={handleShareLock}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors backdrop-blur"
                >
                  <Share2 className="w-5 h-5" />
                  <span className="hidden sm:inline">{t('lock.shareLock')}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-blue-100 text-sm mb-1">{t('lock.totalValue')}</div>
                  <div className="text-2xl font-bold">{formatCurrency(tokenStats.total_value_usd)}</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-blue-100 text-sm mb-1">{t('lock.priceUsd')}</div>
                  <div className="text-2xl font-bold">${tokenStats.current_price_usd.toFixed(6)}</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-blue-100 text-sm mb-1">{t('lock.activeLocks')}</div>
                  <div className="text-2xl font-bold">{tokenStats.active_locks_count}</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-blue-100 text-sm mb-1">{t('lock.totalQuantityLocked')}</div>
                  <div className="text-2xl font-bold">
                    {formatLargeTokenAmount(
                      tokenStats.non_withdrawn_amount_locked || tokenStats.active_amount_locked,
                      tokenStats.token_decimals
                    )} {tokenStats.token_symbol}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('lock.title')}</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('lock.subtitle')}
            </p>
          </div>
        )}

        {!urlTokenAddress && (
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
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('lock.tokenAddress')}
                  </label>
                  <input
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => {
                      setTokenAddress(e.target.value);
                      setTokenValidationError(null);
                    }}
                    onFocus={() => setShowTokenDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTokenDropdown(false), 200)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {showTokenDropdown && popularTokens.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 border-b border-gray-200 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-600 uppercase">{t('lock.popularTokensDropdown')}</div>
                      </div>
                      {popularTokens.map((token) => (
                        <button
                          key={token.token_address}
                          onClick={() => {
                            setTokenAddress(token.token_address);
                            setShowTokenDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{token.symbol}</span>
                                <span className="text-sm text-gray-600 truncate">{token.name}</span>
                              </div>
                              <div className="text-xs text-gray-500 font-mono truncate mt-1">{token.token_address}</div>
                            </div>
                            <div className="ml-2 text-right">
                              <div className="text-sm font-semibold text-gray-900">
                                {parseFloat(token.current_eth_reserve.toString()).toFixed(4)} ETH
                              </div>
                              <div className="text-xs text-gray-500">Liquidity</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {tokenValidationError && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
                        <div className="text-sm text-red-800">
                          {tokenValidationError}
                        </div>
                      </div>
                    </div>
                  )}
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
                    min="0"
                    step="any"
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
                    min="1"
                    step="1"
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
                    disabled={isLocking || !tokenInfo || !tokenInfo.isMcFunToken || !amount || !duration}
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
        )}

        {!urlTokenAddress && topLockedTokens.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <Trophy className="w-6 h-6 mr-2 text-yellow-500" />
              {t('lock.topLockedTokens')}
            </h2>
            <div className="space-y-3">
              {topLockedTokens.map((aggLock, index) => {
                const lockCount = aggLock.lock_count || 0;
                const totalValueUsd = aggLock.total_value_usd || 0;
                const totalValueEth = aggLock.total_value_eth || 0;
                const avgPerLock = safeDivide(totalValueUsd, lockCount);

                return (
                  <div
                    key={aggLock.token_address}
                    onClick={() => navigate(`/lock/${aggLock.token_address}`)}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
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
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-lg font-bold text-gray-900 whitespace-nowrap">{aggLock.token_symbol}</h3>
                            <span className="text-sm text-gray-500 break-words">{aggLock.token_name || 'Unknown'}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">{t('lock.totalLocked')}:</span>
                              <span className="ml-2 font-semibold text-gray-900">
                                {formatLargeTokenAmount(aggLock.total_amount_locked, aggLock.token_decimals || 18)} {aggLock.token_symbol}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">{t('lock.lockCount')}:</span>
                              <span className="ml-2 font-semibold text-gray-900">
                                {lockCount} {t('lock.locks')}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">{t('lock.avgPerLock')}:</span>
                              <span className="ml-2 font-semibold text-gray-900">
                                {formatCurrency(avgPerLock)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm text-gray-500 mb-1">{t('lock.totalValue')}</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {formatCurrency(totalValueUsd)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
