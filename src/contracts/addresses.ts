export const SUPPORTED_CHAIN_IDS = [11155111] as const;
export const DEFAULT_CHAIN_ID = 11155111;

export const NETWORK_CONFIG: Record<number, {
  name: string;
  factoryAddress: string;
  explorerUrl: string;
}> = {
  1: {
    name: 'Ethereum Mainnet',
    factoryAddress: '0x0000000000000000000000000000000000000000',
    explorerUrl: 'https://etherscan.io',
  },
  11155111: {
    name: 'Sepolia Testnet',
    factoryAddress: '0xDE377c1C3280C2De18479Acbe40a06a79E0B3831',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
};

export function getFactoryAddress(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.factoryAddress || NETWORK_CONFIG[DEFAULT_CHAIN_ID].factoryAddress;
}

export function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAIN_IDS.includes(chainId as any);
}

export function getNetworkName(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.name || 'Unknown Network';
}

export function getExplorerUrl(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.explorerUrl || 'https://etherscan.io';
}

export const FEE_RECIPIENT = "0x227D5F29bAb4Cec30f511169886b86fAeF61C6bc";
export const MIN_LIQUIDITY_ETH = "0.1";
export const MIN_LIQUIDITY_PERCENT = 50;
export const RECOMMENDED_LIQUIDITY_PERCENT = 75;
export const TOTAL_SUPPLY = 1_000_000;
export const FEE_PERCENT = 0.4;
export const MAX_NAME_LENGTH = 20;
export const MAX_SYMBOL_LENGTH = 7;
