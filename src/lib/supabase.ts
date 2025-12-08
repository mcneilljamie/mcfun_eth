import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Token {
  id: string;
  token_address: string;
  amm_address: string;
  name: string;
  symbol: string;
  creator_address: string;
  liquidity_percent: number;
  initial_liquidity_eth: string;
  current_eth_reserve: string;
  current_token_reserve: string;
  total_volume_eth: string;
  website?: string;
  created_at: string;
}

export interface Swap {
  id: string;
  token_address: string;
  amm_address: string;
  user_address: string;
  eth_in: string;
  token_in: string;
  eth_out: string;
  token_out: string;
  tx_hash: string;
  created_at: string;
}

export interface PriceSnapshot {
  id: string;
  token_address: string;
  price_eth: string;
  eth_reserve: string;
  token_reserve: string;
  created_at: string;
}
