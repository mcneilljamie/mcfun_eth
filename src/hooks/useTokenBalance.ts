import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ERC20_ABI } from '../contracts/abis';

export function useTokenBalance(
  provider: any,
  tokenAddress: string | null,
  userAddress: string | null,
  refreshInterval: number = 10000
) {
  const [balance, setBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);

  const loadBalance = async () => {
    if (!provider || !tokenAddress || !userAddress) {
      setBalance('0');
      setLoading(false);
      return;
    }

    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const bal = await tokenContract.balanceOf(userAddress);
      const decimals = await tokenContract.decimals();
      setBalance(ethers.formatUnits(bal, decimals));
    } catch (err) {
      console.error('Failed to load token balance:', err);
      setBalance('0');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalance();

    if (refreshInterval > 0) {
      const interval = setInterval(loadBalance, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [provider, tokenAddress, userAddress, refreshInterval]);

  return { balance, loading, reload: loadBalance };
}
