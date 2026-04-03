export const SUPPORTED_CHAIN_IDS = [1, 8453] as const;
export const DEFAULT_CHAIN_ID = 1;

export const NETWORK_CONFIG: Record<number, {
  name: string;
  shortName: string;
  factoryAddress: string;
  lockerAddress: string;
  explorerUrl: string;
  minLiquidityETH: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}> = {
  1: {
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    factoryAddress: '0x6E8717dd111Bea3f5B12785798F3d1380c01D72B',
    lockerAddress: '0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38',
    explorerUrl: 'https://etherscan.io',
    minLiquidityETH: '0.1',
    rpcUrl: 'https://eth.llamarpc.com',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  8453: {
    name: 'Base Mainnet',
    shortName: 'Base',
    factoryAddress: '0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2',
    lockerAddress: '0x49Fd91582C442ae01f3d1Db28272b7B053D38b79',
    explorerUrl: 'https://basescan.org',
    minLiquidityETH: '0.01',
    rpcUrl: 'https://mainnet.base.org',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
};

export function getFactoryAddress(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.factoryAddress || NETWORK_CONFIG[DEFAULT_CHAIN_ID].factoryAddress;
}

export function getLockerAddress(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.lockerAddress || NETWORK_CONFIG[DEFAULT_CHAIN_ID].lockerAddress;
}

export function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAIN_IDS.includes(chainId as any);
}

// Fallback network names for common unsupported networks (for display purposes only)
const FALLBACK_NETWORK_NAMES: Record<number, string> = {
  11155111: 'Sepolia Testnet',
  5: 'Goerli Testnet',
  137: 'Polygon',
  56: 'BSC',
  42161: 'Arbitrum',
  10: 'Optimism',
};

export function getNetworkName(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.name || FALLBACK_NETWORK_NAMES[chainId] || 'Unknown Network';
}

export function getNetworkShortName(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.shortName || getNetworkName(chainId);
}

export function getExplorerUrl(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.explorerUrl || 'https://etherscan.io';
}

export function getMinLiquidityETH(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.minLiquidityETH || NETWORK_CONFIG[DEFAULT_CHAIN_ID].minLiquidityETH;
}

export function getRpcUrl(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.rpcUrl || NETWORK_CONFIG[DEFAULT_CHAIN_ID].rpcUrl;
}

export function getNativeCurrency(chainId: number) {
  return NETWORK_CONFIG[chainId]?.nativeCurrency || NETWORK_CONFIG[DEFAULT_CHAIN_ID].nativeCurrency;
}

export const FEE_RECIPIENT = "0x993AEe79ee816B636D80f06186325b19a0eE3D45";
export const MIN_LIQUIDITY_ETH = "0.1"; // Default for Ethereum, use getMinLiquidityETH(chainId) for chain-specific values
export const MIN_LIQUIDITY_PERCENT = 50;
export const RECOMMENDED_LIQUIDITY_PERCENT = 75;
export const TOTAL_SUPPLY = 1_000_000;
export const MAX_NAME_LENGTH = 20;
export const MAX_SYMBOL_LENGTH = 7;
export const MAX_LOCK_DAYS = 10000;

// Chain-specific fee percentages
export function getFeePercent(chainId: number): number {
  if (chainId === 8453) {
    return 0.8; // Base: 0.8%
  }
  return 0.4; // Ethereum and default: 0.4%
}

export function getFeePercentFormatted(chainId: number): string {
  const fee = getFeePercent(chainId);
  return `${fee}%`;
}
