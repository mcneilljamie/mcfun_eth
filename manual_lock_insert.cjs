const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
require('dotenv').config();

const LOCKER_ADDRESS = "0x1277b6E3f4407AD44A9b33641b51848c0098368f";
const TARGET_TX_HASH = "0xdb1e192c3ba6ed014cf609aaaa1d5c1c8c5756a27bc8834fbc7cbece6dddb347";

const LOCKER_ABI = [
  "event TokensLocked(uint256 indexed lockId, address indexed owner, address indexed tokenAddress, uint256 amount, uint256 unlockTime)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  const provider = new ethers.JsonRpcProvider(
    process.env.ETHEREUM_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
  );

  console.log(`Fetching transaction: ${TARGET_TX_HASH}`);

  const receipt = await provider.getTransactionReceipt(TARGET_TX_HASH);
  if (!receipt) {
    console.error('Transaction not found');
    return;
  }

  console.log(`Transaction found in block: ${receipt.blockNumber}`);

  const lockerInterface = new ethers.Interface(LOCKER_ABI);

  const lockEvents = receipt.logs
    .filter(log => log.address.toLowerCase() === LOCKER_ADDRESS.toLowerCase())
    .map(log => {
      try {
        return lockerInterface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter(event => event && event.name === 'TokensLocked');

  if (lockEvents.length === 0) {
    console.error('No TokensLocked events found in this transaction');
    return;
  }

  console.log(`Found ${lockEvents.length} TokensLocked event(s)`);

  for (const event of lockEvents) {
    const lockId = Number(event.args[0]);
    const owner = event.args[1];
    const tokenAddress = event.args[2];
    const amount = event.args[3].toString();
    const unlockTime = Number(event.args[4]);

    console.log(`\nLock ID: ${lockId}`);
    console.log(`Owner: ${owner}`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Amount: ${amount}`);
    console.log(`Unlock Time: ${new Date(unlockTime * 1000).toISOString()}`);

    const { data: existingLock } = await supabase
      .from('token_locks')
      .select('lock_id')
      .eq('lock_id', lockId)
      .maybeSingle();

    if (existingLock) {
      console.log(`Lock ID ${lockId} already exists in database, skipping`);
      continue;
    }

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
    ]);

    console.log(`Token Info: ${name} (${symbol}), ${decimals} decimals`);

    const block = await provider.getBlock(receipt.blockNumber);
    const lockRecord = {
      lock_id: lockId,
      user_address: owner.toLowerCase(),
      token_address: tokenAddress.toLowerCase(),
      token_name: name,
      token_symbol: symbol,
      token_decimals: Number(decimals),
      amount_locked: amount,
      lock_duration_days: Math.floor((unlockTime - block.timestamp) / 86400),
      lock_timestamp: new Date(block.timestamp * 1000).toISOString(),
      unlock_timestamp: new Date(unlockTime * 1000).toISOString(),
      is_withdrawn: false,
      tx_hash: TARGET_TX_HASH.toLowerCase(),
      block_number: receipt.blockNumber,
    };

    const { data, error } = await supabase
      .from('token_locks')
      .insert(lockRecord)
      .select();

    if (error) {
      console.error('Error inserting lock:', error);
    } else {
      console.log('Successfully inserted lock into database');
      console.log(data);
    }
  }

  console.log('\nRefreshing materialized view...');
  const { error: refreshError } = await supabase.rpc('refresh_lock_stats');
  if (refreshError) {
    console.log('Note: Could not refresh materialized view automatically, it will refresh on next scheduled update');
  } else {
    console.log('Materialized view refreshed');
  }
}

main().catch(console.error);
