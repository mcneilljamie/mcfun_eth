import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

interface Web3ContextType {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (targetChainId: number) => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

const STORAGE_KEY = 'wallet_connected';

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      if (!window.ethereum) {
        throw new Error('Please install MetaMask or another Web3 wallet');
      }

      const newProvider = new BrowserProvider(window.ethereum);
      const accounts = await newProvider.send('eth_requestAccounts', []);
      const newSigner = await newProvider.getSigner();
      const network = await newProvider.getNetwork();

      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));

      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      console.error('Failed to connect wallet:', err);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const switchNetwork = async (targetChainId: number) => {
    if (!window.ethereum) return;

    try {
      const chainIdHex = `0x${targetChainId.toString(16)}`;
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        console.error('Network not added to wallet');
      }
      throw err;
    }
  };

  useEffect(() => {
    const attemptReconnect = async () => {
      const wasConnected = localStorage.getItem(STORAGE_KEY);
      if (wasConnected && window.ethereum) {
        try {
          const newProvider = new BrowserProvider(window.ethereum);
          const accounts = await newProvider.send('eth_accounts', []);

          if (accounts.length > 0) {
            const newSigner = await newProvider.getSigner();
            const network = await newProvider.getNetwork();

            setProvider(newProvider);
            setSigner(newSigner);
            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch (err) {
          console.error('Failed to reconnect:', err);
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    };

    attemptReconnect();
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAccount(accounts[0]);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum?.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        isConnecting,
        error,
        connect,
        disconnect,
        switchNetwork,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
