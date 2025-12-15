import { useEffect, useState } from 'react';
import { useWeb3 } from '../lib/web3';
import { supabase } from '../lib/supabase';
import { ethers } from 'ethers';
import { getEthPriceUSD } from '../lib/ethPrice';
import { Loader2, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface TokenBalance {
  tokenAddress: string;
  symbol: string;
  name: string;
  balance: string;
  priceEth: number;
  priceUsd: number;
  valueEth: number;
  valueUsd: number;
  change24h: number;
}

export default function Portfolio() {
  const { account, provider } = useWeb3();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [ethBalance, setEthBalance] = useState('0');
  const [ethPriceUsd, setEthPriceUsd] = useState(0);
  const [totalValueUsd, setTotalValueUsd] = useState(0);

  useEffect(() => {
    if (account && provider) {
      loadPortfolio();
    } else {
      setLoading(false);
    }
  }, [account, provider]);

  const loadPortfolio = async () => {
    if (!account || !provider) return;

    try {
      setLoading(true);

      // Get ETH price
      const ethPrice = await getEthPriceUSD();
      setEthPriceUsd(ethPrice);

      // Get ETH balance
      const balance = await provider.getBalance(account);
      const ethBal = ethers.formatEther(balance);
      setEthBalance(ethBal);

      // Get all tokens from the platform
      const { data: allTokens } = await supabase
        .from('tokens')
        .select('token_address, symbol, name, current_eth_reserve, current_token_reserve');

      if (!allTokens || allTokens.length === 0) {
        setLoading(false);
        return;
      }

      // Get 24h price changes
      const { data: priceChanges } = await supabase.rpc('get_24h_price_changes');

      const priceChangeMap = new Map(
        priceChanges?.map((pc: any) => [pc.token_address, pc.price_change_24h]) || []
      );

      // Check balances for each token
      const tokenBalances: TokenBalance[] = [];
      const ERC20_ABI = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      for (const token of allTokens) {
        try {
          const contract = new ethers.Contract(token.token_address, ERC20_ABI, provider);
          const [balance, decimals] = await Promise.all([
            contract.balanceOf(account),
            contract.decimals(),
          ]);

          const balanceFormatted = ethers.formatUnits(balance, decimals);

          if (parseFloat(balanceFormatted) > 0) {
            const ethReserve = parseFloat(token.current_eth_reserve);
            const tokenReserve = parseFloat(token.current_token_reserve);
            const priceEth = ethReserve / tokenReserve;
            const priceUsd = priceEth * ethPrice;
            const valueEth = parseFloat(balanceFormatted) * priceEth;
            const valueUsd = valueEth * ethPrice;
            const change24h = priceChangeMap.get(token.token_address) || 0;

            tokenBalances.push({
              tokenAddress: token.token_address,
              symbol: token.symbol,
              name: token.name,
              balance: balanceFormatted,
              priceEth,
              priceUsd,
              valueEth,
              valueUsd,
              change24h,
            });
          }
        } catch (err) {
          console.error(`Error loading balance for ${token.symbol}:`, err);
        }
      }

      // Sort by value USD descending
      tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);
      setTokens(tokenBalances);

      // Calculate total value
      const ethValue = parseFloat(ethBal) * ethPrice;
      const tokensValue = tokenBalances.reduce((sum, t) => sum + t.valueUsd, 0);
      setTotalValueUsd(ethValue + tokensValue);

      setLoading(false);
    } catch (err) {
      console.error('Error loading portfolio:', err);
      setLoading(false);
    }
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

  const formatPrice = (value: number) => {
    if (value >= 1) {
      return `$${value.toFixed(4)}`;
    } else if (value >= 0.0001) {
      return `$${value.toFixed(6)}`;
    } else {
      return `$${value.toFixed(8)}`;
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

  if (!account) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
          <p className="text-gray-600">
            Connect your wallet to view your portfolio
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
          <span className="ml-3 text-gray-600">Loading portfolio...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Portfolio Summary */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-8 mb-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Portfolio Value</h1>
        <div className="text-5xl font-bold mb-4">{formatCurrency(totalValueUsd)}</div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-blue-100 mb-1">ETH Balance</div>
            <div className="font-semibold">
              {parseFloat(ethBalance).toFixed(4)} ETH
              <span className="text-blue-100 ml-2">
                ({formatCurrency(parseFloat(ethBalance) * ethPriceUsd)})
              </span>
            </div>
          </div>
          <div>
            <div className="text-blue-100 mb-1">Tokens Value</div>
            <div className="font-semibold">
              {formatCurrency(tokens.reduce((sum, t) => sum + t.valueUsd, 0))}
            </div>
          </div>
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          This page tracks your ETH balance and tokens that are traded on McFun.
        </p>
      </div>

      {/* Token Holdings */}
      {tokens.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">No token holdings found</p>
          <Link
            to="/tokens"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Tokens
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tokens.map((token) => (
                  <tr
                    key={token.tokenAddress}
                    onClick={() => navigate(`/token/${token.tokenAddress}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900">{token.symbol}</div>
                        <div className="text-sm text-gray-500">{token.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-medium text-gray-900">
                        {formatNumber(token.balance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-medium text-gray-900">
                        {formatPrice(token.priceUsd)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(token.valueUsd)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
