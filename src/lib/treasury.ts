import { supabase } from './supabase';

export const TREASURY_ADDRESS = '0x993AEe79ee816B636D80f06186325b19a0eE3D45';
export const MCFUN_TOKEN_ADDRESS = '0xe03e4d90a46f62ac405708ba5036f292d5e0edc8';
export const MCFUN_TOTAL_SUPPLY = 1_000_000;

const ETH_RPC = 'https://ethereum.publicnode.com';
const BASE_RPC = 'https://base.publicnode.com';

export interface TreasuryBalances {
  ethereum: number;
  base: number;
  total: number;
}

export interface TreasuryDeposit {
  hash: string;
  from: string;
  valueEth: number;
  timestamp: number;
  chainId: number;
  explorerUrl: string;
}

async function fetchNativeBalance(rpc: string): Promise<number> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: [TREASURY_ADDRESS, 'latest'],
      id: 1,
    }),
  });
  const json = await res.json();
  if (!json?.result) throw new Error('Missing balance result');
  return parseInt(json.result, 16) / 1e18;
}

export async function fetchTreasuryBalances(): Promise<TreasuryBalances> {
  const [ethereum, base] = await Promise.all([
    fetchNativeBalance(ETH_RPC),
    fetchNativeBalance(BASE_RPC),
  ]);
  return { ethereum, base, total: ethereum + base };
}

export async function fetchMcfunCirculatingSupply(): Promise<number> {
  const { data, error } = await supabase
    .from('token_burn_totals')
    .select('total_amount_burned')
    .eq('token_address', MCFUN_TOKEN_ADDRESS)
    .maybeSingle();

  if (error) throw error;

  const burnedWei = data?.total_amount_burned ? parseFloat(data.total_amount_burned) : 0;
  const burnedTokens = isNaN(burnedWei) ? 0 : burnedWei / 1e18;
  const circulating = MCFUN_TOTAL_SUPPLY - burnedTokens;
  return circulating > 0 ? circulating : MCFUN_TOTAL_SUPPLY;
}

export async function fetchTreasuryDeposits(): Promise<TreasuryDeposit[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/treasury-transactions`, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) throw new Error(`Treasury transactions request failed (${res.status})`);

  const json = await res.json();
  if (!Array.isArray(json?.deposits)) return [];
  return json.deposits as TreasuryDeposit[];
}
