import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

interface PollingResult {
  reserveETH: string | null;
  reserveToken: string | null;
  priceETH: number | null;
  timestamp: number;
  isPolling: boolean;
}

const AMM_ABI = [
  'function reserveETH() external view returns (uint256)',
  'function reserveToken() external view returns (uint256)',
];

export function useDirectChainPolling(
  provider: ethers.BrowserProvider | null,
  ammAddress: string | null,
  intervalMs: number = 30000
): PollingResult {
  const [result, setResult] = useState<PollingResult>({
    reserveETH: null,
    reserveToken: null,
    priceETH: null,
    timestamp: 0,
    isPolling: false,
  });

  const pollChain = useCallback(async () => {
    if (!provider || !ammAddress) {
      setResult(prev => ({ ...prev, isPolling: false }));
      return;
    }

    try {
      setResult(prev => ({ ...prev, isPolling: true }));

      const contract = new ethers.Contract(ammAddress, AMM_ABI, provider);

      const [reserveETH, reserveToken] = await Promise.all([
        contract.reserveETH(),
        contract.reserveToken(),
      ]);

      const ethReserve = ethers.formatEther(reserveETH);
      const tokenReserve = ethers.formatEther(reserveToken);

      const ethReserveNum = parseFloat(ethReserve);
      const tokenReserveNum = parseFloat(tokenReserve);
      const priceETH = tokenReserveNum > 0 ? ethReserveNum / tokenReserveNum : null;

      setResult({
        reserveETH: ethReserve,
        reserveToken: tokenReserve,
        priceETH,
        timestamp: Date.now(),
        isPolling: false,
      });
    } catch (error) {
      console.error('Error polling chain:', error);
      setResult(prev => ({ ...prev, isPolling: false }));
    }
  }, [provider, ammAddress]);

  useEffect(() => {
    if (!provider || !ammAddress) return;

    pollChain();

    const interval = setInterval(() => {
      pollChain();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [provider, ammAddress, intervalMs, pollChain]);

  return result;
}
