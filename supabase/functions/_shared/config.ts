/**
 * Shared configuration for edge functions
 * Multi-chain deployment addresses and RPC configuration
 */

export interface ChainConfig {
  CHAIN_ID: number;
  FACTORY_ADDRESS: string;
  LOCKER_ADDRESS: string;
  FACTORY_DEPLOYMENT_BLOCK: number;
  LOCKER_DEPLOYMENT_BLOCK: number;
  PRIMARY_RPC: string;
  FALLBACK_RPCS: string[];
  CHAIN_NAME: string;
}

export const ETHEREUM_CONFIG: ChainConfig = {
  CHAIN_ID: 1,
  CHAIN_NAME: "Ethereum",
  FACTORY_ADDRESS: "0x6E8717dd111Bea3f5B12785798F3d1380c01D72B",
  LOCKER_ADDRESS: "0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38",
  FACTORY_DEPLOYMENT_BLOCK: 24328122,
  LOCKER_DEPLOYMENT_BLOCK: 24328123,
  PRIMARY_RPC: "https://eth.drpc.org",
  FALLBACK_RPCS: [
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://ethereum.blockpi.network/v1/rpc/public",
    "https://eth.llamarpc.com"
  ],
};

export const BASE_CONFIG: ChainConfig = {
  CHAIN_ID: 8453,
  CHAIN_NAME: "Base",
  FACTORY_ADDRESS: "0x5543D0e48e6812B0A0F671d2F7E81103E8Fe39B2",
  LOCKER_ADDRESS: "0x49Fd91582C442ae01f3d1Db28272b7B053D38b79",
  FACTORY_DEPLOYMENT_BLOCK: 24867400,
  LOCKER_DEPLOYMENT_BLOCK: 24867401,
  PRIMARY_RPC: "https://mainnet.base.org",
  FALLBACK_RPCS: [
    "https://base.llamarpc.com",
    "https://base.blockpi.network/v1/rpc/public",
    "https://base-mainnet.public.blastapi.io"
  ],
};

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: ETHEREUM_CONFIG,
  8453: BASE_CONFIG,
};

export const SUPPORTED_CHAIN_IDS = [1, 8453] as const;

/**
 * Get chain config for a specific chain ID
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

/**
 * Get factory address for a specific chain
 */
export function getFactoryAddress(chainId: number): string {
  return getChainConfig(chainId).FACTORY_ADDRESS;
}

/**
 * Get locker address for a specific chain
 */
export function getLockerAddress(chainId: number): string {
  return getChainConfig(chainId).LOCKER_ADDRESS;
}

/**
 * Get RPC URLs for a specific chain
 */
export function getRPCProviders(chainId: number): string[] {
  const config = getChainConfig(chainId);
  return [config.PRIMARY_RPC, ...config.FALLBACK_RPCS];
}

/**
 * Get factory deployment block for a specific chain
 */
export function getFactoryDeploymentBlock(chainId: number): number {
  return getChainConfig(chainId).FACTORY_DEPLOYMENT_BLOCK;
}

/**
 * Get locker deployment block for a specific chain
 */
export function getLockerDeploymentBlock(chainId: number): number {
  return getChainConfig(chainId).LOCKER_DEPLOYMENT_BLOCK;
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return [...SUPPORTED_CHAIN_IDS];
}
