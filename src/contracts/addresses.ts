export const SUPPORTED_CHAIN_IDS = [1, 11155111] as const;
export const DEFAULT_CHAIN_ID = 1;

export const NETWORK_CONFIG: Record<number, {
  name: string;
  factoryAddress: string;
  lockerAddress: string;
  explorerUrl: string;
}> = {
  1: {
    name: 'Ethereum Mainnet',
    factoryAddress: '0x6E8717dd111Bea3f5B12785798F3d1380c01D72B',
    lockerAddress: '0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38',
    explorerUrl: 'https://etherscan.io',
  },
  11155111: {
    name: 'Sepolia Testnet',
    factoryAddress: '0xDE377c1C3280C2De18479Acbe40a06a79E0B3831',
    lockerAddress: '0x1277b6E3f4407AD44A9b33641b51848c0098368f',
    explorerUrl: 'https://sepolia.etherscan.io',
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

export function getNetworkName(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.name || 'Unknown Network';
}

export function getExplorerUrl(chainId: number): string {
  return NETWORK_CONFIG[chainId]?.explorerUrl || 'https://etherscan.io';
}

export const FEE_RECIPIENT = "0x993AEe79ee816B636D80f06186325b19a0eE3D45";
export const MIN_LIQUIDITY_ETH = "0.1";
export const MIN_LIQUIDITY_PERCENT = 50;
export const RECOMMENDED_LIQUIDITY_PERCENT = 75;
export const TOTAL_SUPPLY = 1_000_000;
export const FEE_PERCENT = 0.4;
export const MAX_NAME_LENGTH = 20;
export const MAX_SYMBOL_LENGTH = 7;
export const MAX_LOCK_DAYS = 10000;
