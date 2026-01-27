/**
 * Shared configuration for edge functions
 * Mainnet deployment addresses and RPC configuration
 */

export const MAINNET_CONFIG = {
  // Contract addresses from mainnet deployment
  FACTORY_ADDRESS: "0x6E8717dd111Bea3f5B12785798F3d1380c01D72B",
  LOCKER_ADDRESS: "0xaDEcE045ccC27b3364628499F2DDF4eAaD034D38",

  // Deployment blocks
  FACTORY_DEPLOYMENT_BLOCK: 24328122,
  LOCKER_DEPLOYMENT_BLOCK: 24328123,

  // RPC URLs
  PRIMARY_RPC: "https://ethereum-rpc.publicnode.com",
  FALLBACK_RPCS: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://ethereum.blockpi.network/v1/rpc/public"
  ],

  CHAIN_ID: 1,
};

/**
 * Get factory address from env or use mainnet default
 */
export function getFactoryAddress(): string {
  return Deno.env.get("MCFUN_FACTORY_ADDRESS") || MAINNET_CONFIG.FACTORY_ADDRESS;
}

/**
 * Get locker address from env or use mainnet default
 */
export function getLockerAddress(): string {
  return Deno.env.get("MCFUN_LOCKER_ADDRESS") || MAINNET_CONFIG.LOCKER_ADDRESS;
}

/**
 * Get RPC URLs from env or use mainnet defaults
 */
export function getRPCProviders(): string[] {
  const primaryRPC = Deno.env.get("MCFUN_RPC_URL") || MAINNET_CONFIG.PRIMARY_RPC;
  const fallbackRPCs = Deno.env.get("MCFUN_RPC_URL_FALLBACKS")?.split(",").filter(url => url.trim()) || MAINNET_CONFIG.FALLBACK_RPCS;
  return [primaryRPC, ...fallbackRPCs];
}

/**
 * Get chain ID from env or use mainnet default
 */
export function getChainId(): number {
  return parseInt(Deno.env.get("MCFUN_CHAIN_ID") || String(MAINNET_CONFIG.CHAIN_ID));
}

/**
 * Get factory deployment block from env or use mainnet default
 */
export function getFactoryDeploymentBlock(): number {
  return parseInt(Deno.env.get("MCFUN_FACTORY_DEPLOYMENT_BLOCK") || String(MAINNET_CONFIG.FACTORY_DEPLOYMENT_BLOCK));
}

/**
 * Get locker deployment block from env or use mainnet default
 */
export function getLockerDeploymentBlock(): number {
  return parseInt(Deno.env.get("MCFUN_LOCKER_DEPLOYMENT_BLOCK") || String(MAINNET_CONFIG.LOCKER_DEPLOYMENT_BLOCK));
}
