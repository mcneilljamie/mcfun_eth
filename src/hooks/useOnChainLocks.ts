import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { TOKEN_LOCKER_ABI, ERC20_ABI } from '../contracts/abis';
import { getLockerAddress } from '../contracts/addresses';

export interface OnChainLock {
  lockId: number;
  owner: string;
  tokenAddress: string;
  amount: bigint;
  unlockTime: number;
  withdrawn: boolean;
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimals?: number;
}

export function useOnChainLocks(provider: any, chainId: number | undefined, userAddress: string | null) {
  const [locks, setLocks] = useState<OnChainLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLocks = async () => {
    if (!provider || !chainId || !userAddress) {
      setLocks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const lockerAddress = getLockerAddress(chainId);
      if (!lockerAddress) {
        throw new Error('Token locker not available on this network');
      }

      const lockerContract = new ethers.Contract(lockerAddress, TOKEN_LOCKER_ABI, provider);

      // Get the next lock ID to know how many locks exist
      const nextLockId = await lockerContract.nextLockId();
      const totalLocks = Number(nextLockId);

      // Query all locks and filter by user
      const userLocks: OnChainLock[] = [];

      // Batch queries for efficiency
      const batchSize = 50;
      for (let i = 0; i < totalLocks; i += batchSize) {
        const batch = [];
        const end = Math.min(i + batchSize, totalLocks);

        for (let lockId = i; lockId < end; lockId++) {
          batch.push(
            lockerContract.getLock(lockId).catch(() => null)
          );
        }

        const results = await Promise.all(batch);

        for (let j = 0; j < results.length; j++) {
          const lockData = results[j];
          if (!lockData) continue;

          const lockId = i + j;
          const owner = lockData[0];

          // Only include locks owned by the user
          if (owner.toLowerCase() === userAddress.toLowerCase()) {
            const tokenAddress = lockData[1];
            const amount = lockData[2];
            const unlockTime = Number(lockData[3]);
            const withdrawn = lockData[4];

            userLocks.push({
              lockId,
              owner,
              tokenAddress,
              amount,
              unlockTime,
              withdrawn,
            });
          }
        }
      }

      // Load token metadata for each unique token
      const uniqueTokens = new Map<string, OnChainLock[]>();
      for (const lock of userLocks) {
        const addr = lock.tokenAddress.toLowerCase();
        if (!uniqueTokens.has(addr)) {
          uniqueTokens.set(addr, []);
        }
        uniqueTokens.get(addr)!.push(lock);
      }

      // Fetch token info in parallel
      const tokenInfoPromises = Array.from(uniqueTokens.keys()).map(async (tokenAddress) => {
        try {
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const [symbol, name, decimals] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.name(),
            tokenContract.decimals(),
          ]);
          return { tokenAddress, symbol, name, decimals: Number(decimals) };
        } catch (err) {
          console.error(`Failed to load token info for ${tokenAddress}:`, err);
          return { tokenAddress, symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 18 };
        }
      });

      const tokenInfos = await Promise.all(tokenInfoPromises);
      const tokenInfoMap = new Map(tokenInfos.map(info => [info.tokenAddress.toLowerCase(), info]));

      // Add token metadata to locks
      for (const lock of userLocks) {
        const info = tokenInfoMap.get(lock.tokenAddress.toLowerCase());
        if (info) {
          lock.tokenSymbol = info.symbol;
          lock.tokenName = info.name;
          lock.tokenDecimals = info.decimals;
        }
      }

      setLocks(userLocks);
    } catch (err: any) {
      console.error('Failed to load on-chain locks:', err);
      setError(err.message || 'Failed to load locks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocks();
  }, [provider, chainId, userAddress]);

  return { locks, loading, error, reload: loadLocks };
}
