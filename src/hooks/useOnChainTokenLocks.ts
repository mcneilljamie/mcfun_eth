import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { TOKEN_LOCKER_ABI, ERC20_ABI } from '../contracts/abis';
import { getLockerAddress } from '../contracts/addresses';

export interface OnChainTokenLock {
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

export function useOnChainTokenLocks(
  provider: any,
  chainId: number | undefined,
  tokenAddress: string | null
) {
  const [locks, setLocks] = useState<OnChainTokenLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLocks = async () => {
    if (!provider || !chainId || !tokenAddress || !ethers.isAddress(tokenAddress)) {
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

      const nextLockId = await lockerContract.nextLockId();
      const totalLocks = Number(nextLockId);

      const tokenLocks: OnChainTokenLock[] = [];

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
          const lockTokenAddress = lockData[1];
          const amount = lockData[2];
          const unlockTime = Number(lockData[3]);
          const withdrawn = lockData[4];

          if (lockTokenAddress.toLowerCase() === tokenAddress.toLowerCase()) {
            tokenLocks.push({
              lockId,
              owner,
              tokenAddress: lockTokenAddress,
              amount,
              unlockTime,
              withdrawn,
            });
          }
        }
      }

      if (tokenLocks.length > 0) {
        try {
          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const [symbol, name, decimals] = await Promise.all([
            tokenContract.symbol(),
            tokenContract.name(),
            tokenContract.decimals(),
          ]);

          for (const lock of tokenLocks) {
            lock.tokenSymbol = symbol;
            lock.tokenName = name;
            lock.tokenDecimals = Number(decimals);
          }
        } catch (err) {
          console.error(`Failed to load token info for ${tokenAddress}:`, err);
        }
      }

      setLocks(tokenLocks);
    } catch (err: any) {
      console.error('Failed to load on-chain token locks:', err);
      setError(err.message || 'Failed to load locks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocks();
  }, [provider, chainId, tokenAddress]);

  return { locks, loading, error, reload: loadLocks };
}
