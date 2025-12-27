import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { Loader2, Flame, AlertTriangle, User, TrendingUp, Trophy, ArrowLeft, Share2, ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToastMessage } from '../App';
import { getExplorerUrl, getFactoryAddress } from '../contracts/addresses';
import { ERC20_ABI, MCFUN_FACTORY_ABI } from '../contracts/abis';
import { getEthPriceUSD } from '../lib/ethPrice';
import { formatUSD, formatNumber as formatNumberWithCommas } from '../lib/utils';
import { BurnSuccess } from '../components/BurnSuccess';

const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

interface TokenBurn {
  token_address: string;
  token_name: string;
  token_symbol: string;
  amount_burned: string;
  value_usd: number;
  tx_hash: string;
  burn_timestamp: string;
}

interface AggregatedBurn {
  token_address: string;
  token_name: string;
  token_symbol: string;
  total_amount_burned: string;
  total_value_usd: number;
  burn_count: number;
  last_burn_timestamp: string;
}

interface BurnPageProps {
  onShowToast: (toast: ToastMessage) => void;
}

export function Burn({ onShowToast }: BurnPageProps) {
  const { t } = useTranslation();
  const { tokenAddress: urlTokenAddress } = useParams<{ tokenAddress: string }>();
  const navigate = useNavigate();
  const { account, provider, signer, chainId } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [aggregatedBurns, setAggregatedBurns] = useState<AggregatedBurn[]>([]);

  const [tokenAddress, setTokenAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number; balance: string; isMcFunToken: boolean } | null>(null);
  const [isBurning, setIsBurning] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [tokenValidationError, setTokenValidationError] = useState<string | null>(null);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [popularTokens, setPopularTokens] = useState<Array<{ token_address: string; name: string; symbol: string; current_eth_reserve: number; current_token_reserve: number; total_volume_eth: number }>>([]);
  const [ethPriceUSD, setEthPriceUSD] = useState<number>(3000);
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [showBurnSuccess, setShowBurnSuccess] = useState(false);
  const [burnSuccessData, setBurnSuccessData] = useState<{
    tokenSymbol: string;
    tokenName: string;
    tokenAddress: string;
    amountBurned: string;
    txHash: string;
  } | null>(null);
  const [isRefreshingBurns, setIsRefreshingBurns] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadAggregatedBurns();
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

  useEffect(() => {
    loadEthPrice();
    const interval = setInterval(loadEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (ethPriceUSD > 0) {
      loadPopularTokens();
    }
  }, [ethPriceUSD]);

  const loadEthPrice = async () => {
    const price = await getEthPriceUSD();
    setEthPriceUSD(price);
  };

  const loadAggregatedBurns = async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsRefreshingBurns(true);
      }

      const { data, error } = await supabase.rpc('get_aggregated_burns');

      if (error) {
        console.error('Supabase error loading aggregated burns:', error);
        if (showLoading) {
          setIsRefreshingBurns(false);
        }
        return;
      }

      if (data) {
        console.log('Loaded aggregated burns:', data);
        const validBurns = data.filter((burn: any) =>
          burn &&
          burn.token_address &&
          burn.token_symbol &&
          burn.total_amount_burned
        );
        setAggregatedBurns(validBurns);
      }
    } catch (err) {
      console.error('Failed to load aggregated burns:', err);
    } finally {
      if (showLoading) {
        setIsRefreshingBurns(false);
      }
    }
  };

  const loadPopularTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('token_address, name, symbol, current_eth_reserve, current_token_reserve, total_volume_eth')
        .not('current_eth_reserve', 'is', null)
        .not('current_token_reserve', 'is', null);

      if (!error && data) {
        const TOKEN_TOTAL_SUPPLY = 1000000;
        const sorted = data
          .map(token => ({
            ...token,
            marketCap: (() => {
              const ethReserve = parseFloat(token.current_eth_reserve.toString());
              const tokenReserve = parseFloat(token.current_token_reserve.toString());
              if (tokenReserve === 0) return 0;
              const priceInEth = ethReserve / tokenReserve;
              const priceUSD = priceInEth * ethPriceUSD;
              return priceUSD * TOKEN_TOTAL_SUPPLY;
            })()
          }))
          .sort((a, b) => b.marketCap - a.marketCap)
          .slice(0, 10);

        console.log('Loaded popular tokens:', sorted);
        setPopularTokens(sorted);
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

      const factoryAddress = getFactoryAddress(chainId);
      const factoryContract = new ethers.Contract(factoryAddress, MCFUN_FACTORY_ABI, provider);
      const ammAddress = await factoryContract.tokenToAMM(tokenAddress);
      const isMcFunToken = ammAddress !== ethers.ZeroAddress;

      if (!isMcFunToken) {
        setTokenInfo(null);
        setTokenValidationError(t('burn.errors.notMcFunToken'));
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
      setTokenValidationError(t('burn.errors.invalidToken'));
    }
  };

  const checkAllowance = async () => {
    setNeedsApproval(false);
  };

  const handleBurn = async () => {
    console.log('handleBurn called', {
      signer: !!signer,
      tokenInfo,
      amount,
      chainId,
      confirmBurn,
      tokenAddress,
    });

    if (!signer || !tokenInfo || !amount || !chainId) {
      console.log('Missing required fields - returning');
      return;
    }

    const amountNum = parseFloat(amount);
    console.log('Amount parsed:', amountNum, 'Balance:', tokenInfo.balance);

    if (amountNum <= 0) {
      console.log('Invalid amount - must be > 0');
      onShowToast({
        message: t('burn.errors.invalidInput'),
        type: 'error',
      });
      return;
    }

    if (amountNum > parseFloat(tokenInfo.balance)) {
      console.log('Insufficient balance');
      onShowToast({
        message: t('burn.errors.insufficientBalance'),
        type: 'error',
      });
      return;
    }

    if (!confirmBurn) {
      console.log('Setting confirmBurn to true');
      setConfirmBurn(true);
      return;
    }

    try {
      setIsBurning(true);
      console.log('Creating token contract for address:', tokenAddress);
      console.log('Using signer:', await signer.getAddress());
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const amountWei = ethers.parseUnits(amount, tokenInfo.decimals);
      console.log('Amount in wei:', amountWei.toString());
      console.log('Burn address:', BURN_ADDRESS);

      console.log('Calling transfer...');
      const tx = await tokenContract.transfer(BURN_ADDRESS, amountWei);
      console.log('Transaction sent:', tx.hash);

      onShowToast({
        message: t('burn.burning'),
        type: 'info',
      });

      console.log('Waiting for confirmation...');
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      setBurnSuccessData({
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        tokenAddress: tokenAddress,
        amountBurned: amount,
        txHash: tx.hash,
      });
      setShowBurnSuccess(true);

      setTokenAddress('');
      setAmount('');
      setTokenInfo(null);
      setConfirmBurn(false);

      setTimeout(() => {
        loadAggregatedBurns();
      }, 2000);
    } catch (err: any) {
      console.error('Burn failed:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        reason: err.reason,
        data: err.data,
        error: err.error,
        shortMessage: err.shortMessage,
      });

      let errorMessage = t('burn.errors.burnFailed');

      if (err.code === 'ACTION_REJECTED' ||
          err.message?.includes('user rejected') ||
          err.message?.includes('User denied') ||
          err.code === 4001) {
        errorMessage = t('burn.errors.userRejected');
      } else if (err.reason) {
        errorMessage = `${t('burn.errors.burnFailed')}: ${err.reason}`;
      } else if (err.shortMessage) {
        errorMessage = `${t('burn.errors.burnFailed')}: ${err.shortMessage}`;
      } else if (err.message?.includes('insufficient')) {
        errorMessage = t('burn.errors.insufficientBalance');
      } else if (err.message) {
        const cleanMessage = err.message.split('\n')[0].substring(0, 100);
        errorMessage = `${t('burn.errors.burnFailed')}: ${cleanMessage}`;
      }

      onShowToast({
        message: errorMessage,
        type: 'error',
      });
    } finally {
      setIsBurning(false);
    }
  };

  const topBurnedTokens = aggregatedBurns
    .sort((a, b) => (b.total_value_usd || 0) - (a.total_value_usd || 0));

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

  const explorerUrl = getExplorerUrl(chainId || 11155111);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('burn.title')}</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {t('burn.subtitle')}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-red-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <Flame className="w-6 h-6 mr-2 text-red-600" />
              {t('burn.burnTokens')}
            </h2>

            {!account ? (
              <div className="text-center py-12">
                <Flame className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">{t('burn.connectWallet')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('burn.tokenAddress')}
                  </label>
                  <input
                    type="text"
                    value={tokenAddress}
                    onChange={(e) => {
                      setTokenAddress(e.target.value);
                      setTokenValidationError(null);
                      setConfirmBurn(false);
                    }}
                    onFocus={() => setShowTokenDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTokenDropdown(false), 200)}
                    placeholder="0x..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  {showTokenDropdown && popularTokens.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      <div className="p-2 border-b border-gray-200 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-600 uppercase">{t('burn.popularTokensDropdown')}</div>
                      </div>
                      {popularTokens.map((token) => (
                        <button
                          key={token.token_address}
                          onClick={() => {
                            setTokenAddress(token.token_address);
                            setShowTokenDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors border-b border-gray-100 last:border-b-0"
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
                                {(() => {
                                  const TOKEN_TOTAL_SUPPLY = 1000000;
                                  const ethReserve = parseFloat(token.current_eth_reserve.toString());
                                  const tokenReserve = parseFloat(token.current_token_reserve.toString());
                                  if (tokenReserve === 0) return '$0';
                                  const priceInEth = ethReserve / tokenReserve;
                                  const priceUSD = priceInEth * ethPriceUSD;
                                  const marketCap = priceUSD * TOKEN_TOTAL_SUPPLY;
                                  return formatUSD(marketCap);
                                })()}
                              </div>
                              <div className="text-xs text-gray-500">Market Cap</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {tokenValidationError && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start">
                        <AlertTriangle className="w-5 h-5 text-red-600 mr-2 mt-0.5" />
                        <div className="text-sm text-red-800">
                          {tokenValidationError}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {tokenInfo && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">{t('burn.token')}:</span>
                      <span className="font-semibold text-gray-900">
                        {tokenInfo.name} ({tokenInfo.symbol})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t('burn.yourBalance')}:</span>
                      <span className="font-semibold text-gray-900">
                        {formatNumberWithCommas(tokenInfo.balance, 4)} {tokenInfo.symbol}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('burn.amountToBurn')}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setConfirmBurn(false);
                    }}
                    placeholder="0.0"
                    min="0"
                    step="any"
                    disabled={!tokenInfo}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100"
                  />
                </div>

                <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-6 h-6 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-red-900 mb-2">
                        {t('burn.warning')}
                      </div>
                      <div className="text-sm text-red-800">
                        {t('burn.warningDescription')}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBurn}
                  disabled={isBurning || !tokenInfo || !tokenInfo.isMcFunToken || !amount}
                  className={`w-full ${confirmBurn ? 'bg-red-700' : 'bg-red-600'} text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`}
                >
                  {isBurning ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {t('burn.burning')}
                    </>
                  ) : confirmBurn ? (
                    <>
                      <Flame className="w-5 h-5 mr-2" />
                      {t('burn.confirmButton')}
                    </>
                  ) : (
                    <>
                      <Flame className="w-5 h-5 mr-2" />
                      {t('burn.burnButton')}
                    </>
                  )}
                </button>

                {confirmBurn && (
                  <button
                    onClick={() => setConfirmBurn(false)}
                    className="w-full bg-gray-600 text-white py-2 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                  >
                    {t('burn.cancelButton')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-lg p-6 border-2 border-red-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('burn.howItWorks')}</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('burn.step1Title')}</h3>
                  <p className="text-sm text-gray-700">{t('burn.step1Description')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('burn.step2Title')}</h3>
                  <p className="text-sm text-gray-700">{t('burn.step2Description')}</p>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center font-bold mr-3">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{t('burn.step3Title')}</h3>
                  <p className="text-sm text-gray-700">{t('burn.step3Description')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Trophy className="w-6 h-6 mr-2 text-red-600" />
              {t('burn.topBurnedTokens')}
            </h2>
            <button
              onClick={() => loadAggregatedBurns(true)}
              disabled={isRefreshingBurns}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingBurns ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">{t('common.refresh')}</span>
            </button>
          </div>

          {topBurnedTokens.length > 0 ? (
            <div className="space-y-3">
              {topBurnedTokens.map((burn, index) => {
                const burnCount = burn.burn_count || 0;
                const totalValueUsd = burn.total_value_usd || 0;

                return (
                  <div
                    key={burn.token_address}
                    className="border border-gray-200 rounded-lg p-4 hover:border-red-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center space-x-2">
                          {index < 3 && (
                            <Flame
                              className={`w-5 h-5 ${
                                index === 0
                                  ? 'text-red-600'
                                  : index === 1
                                  ? 'text-orange-500'
                                  : 'text-yellow-600'
                              }`}
                            />
                          )}
                          <span className="font-bold text-gray-500 text-lg">#{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-lg font-bold text-gray-900 whitespace-nowrap">{burn.token_symbol}</h3>
                            <span className="text-sm text-gray-500 break-words">{burn.token_name || 'Unknown'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">{t('burn.totalBurned')}:</span>
                              <span className="ml-2 font-semibold text-gray-900">
                                {formatNumber(burn.total_amount_burned)} {burn.token_symbol}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">{t('burn.burnCount')}:</span>
                              <span className="ml-2 font-semibold text-gray-900">
                                {burnCount} {t('burn.burns')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm text-gray-500 mb-1">{t('burn.totalValue')}</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {formatCurrency(totalValueUsd)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Flame className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('burn.noBurnsYet')}</h3>
              <p className="text-gray-600 mb-4">{t('burn.noBurnsDescription')}</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">{t('burn.indexingNote')}</span> {t('burn.indexingDescription')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showBurnSuccess && burnSuccessData && (
        <BurnSuccess
          tokenSymbol={burnSuccessData.tokenSymbol}
          tokenName={burnSuccessData.tokenName}
          tokenAddress={burnSuccessData.tokenAddress}
          amountBurned={burnSuccessData.amountBurned}
          txHash={burnSuccessData.txHash}
          onClose={() => {
            setShowBurnSuccess(false);
            setBurnSuccessData(null);
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
