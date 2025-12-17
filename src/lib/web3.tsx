import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

interface Web3ContextType {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  connect: (walletType?: 'metamask' | 'rabby' | 'phantom') => Promise<void>;
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

  const connect = async (walletType?: 'metamask' | 'rabby' | 'phantom') => {
    console.log('=== WEB3 CONNECT START ===');
    console.log('Wallet type:', walletType);

    try {
      setIsConnecting(true);
      setError(null);

      let provider: any = null;

      if (walletType === 'rabby' && window.rabby) {
        console.log('Using Rabby wallet');
        provider = window.rabby;
      } else if (walletType === 'phantom' && window.phantom?.ethereum) {
        console.log('Using Phantom wallet');
        provider = window.phantom.ethereum;
      } else if (walletType === 'metamask' && window.ethereum) {
        if (window.ethereum.isMetaMask && !window.ethereum.isRabby) {
          console.log('Using MetaMask wallet');
          provider = window.ethereum;
        } else {
          throw new Error('MetaMask not detected. Please install MetaMask extension.');
        }
      } else if (!walletType && window.ethereum) {
        console.log('Using default wallet provider');
        provider = window.ethereum;
      }

      if (!provider) {
        throw new Error('Please install a Web3 wallet');
      }

      console.log('Creating BrowserProvider...');
      const newProvider = new BrowserProvider(provider);
      console.log('BrowserProvider created:', newProvider);

      console.log('Requesting accounts...');
      const accounts = await newProvider.send('eth_requestAccounts', []);
      console.log('Accounts:', accounts);

      console.log('Getting signer...');
      const newSigner = await newProvider.getSigner();
      console.log('Signer:', newSigner);

      console.log('Getting network...');
      const network = await newProvider.getNetwork();
      console.log('Network:', network);
      console.log('Chain ID:', Number(network.chainId));

      console.log('Setting state...');
      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));

      console.log('=== WEB3 CONNECT COMPLETE ===');
      console.log('Provider set:', !!newProvider);
      console.log('Account set:', accounts[0]);
      console.log('Chain ID set:', Number(network.chainId));

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
      console.log('=== ATTEMPTING AUTO-RECONNECT ===');
      const wasConnected = localStorage.getItem(STORAGE_KEY);
      console.log('Was previously connected:', wasConnected);

      if (wasConnected) {
        const providers = [
          window.rabby,
          window.phantom?.ethereum,
          window.ethereum,
        ].filter(Boolean);

        console.log('Found', providers.length, 'available providers');

        for (const provider of providers) {
          try {
            console.log('Trying provider...');
            const newProvider = new BrowserProvider(provider);
            const accounts = await newProvider.send('eth_accounts', []);
            console.log('Accounts found:', accounts);

            if (accounts.length > 0) {
              console.log('Reconnecting with account:', accounts[0]);
              const newSigner = await newProvider.getSigner();
              const network = await newProvider.getNetwork();

              setProvider(newProvider);
              setSigner(newSigner);
              setAccount(accounts[0]);
              setChainId(Number(network.chainId));

              console.log('=== AUTO-RECONNECT SUCCESS ===');
              console.log('Provider:', !!newProvider);
              console.log('Account:', accounts[0]);
              console.log('Chain ID:', Number(network.chainId));
              return;
            }
          } catch (err) {
            console.log('Provider failed, trying next...', err);
            continue;
          }
        }
        console.log('No providers had accounts, clearing storage');
        localStorage.removeItem(STORAGE_KEY);
      } else {
        console.log('Not previously connected, skipping auto-reconnect');
      }
    };

    attemptReconnect();
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          try {
            const currentProvider = window.ethereum;
            const newProvider = new BrowserProvider(currentProvider);
            const newSigner = await newProvider.getSigner();
            const network = await newProvider.getNetwork();

            setProvider(newProvider);
            setSigner(newSigner);
            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
          } catch (err) {
            console.error('Failed to update account:', err);
            disconnect();
          }
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
    rabby?: any;
    phantom?: {
      ethereum?: any;
    };
  }
}
