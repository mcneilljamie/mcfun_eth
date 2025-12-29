import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LOCK_TIMEOUT_MS = 300000;
const LOCK_CHECK_INTERVAL_MS = 1000;

interface LockOptions {
  timeoutSeconds?: number;
  autoRenew?: boolean;
  renewIntervalMs?: number;
}

export async function withLock<T>(
  lockKey: string,
  operation: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const {
    timeoutSeconds = 300,
    autoRenew = false,
    renewIntervalMs = 30000,
  } = options;

  const lockAcquired = await acquireLock(lockKey, timeoutSeconds * 1000);
  if (!lockAcquired) {
    throw new Error(`Failed to acquire lock: ${lockKey}`);
  }

  let renewInterval: number | null = null;
  if (autoRenew) {
    renewInterval = setInterval(async () => {
      await renewLock(lockKey, timeoutSeconds * 1000);
    }, renewIntervalMs);
  }

  try {
    const result = await operation();
    return result;
  } finally {
    if (renewInterval !== null) {
      clearInterval(renewInterval);
    }
    await releaseLock(lockKey);
  }
}

async function acquireLock(
  lockKey: string,
  timeoutMs: number
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMs);

  const { data, error } = await supabase.from("indexer_lock_queue").insert({
    lock_key: lockKey,
    requested_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    status: "active",
  }).select().maybeSingle();

  if (error) {
    console.error("Failed to insert lock:", error);
    return false;
  }

  return true;
}

async function renewLock(
  lockKey: string,
  additionalTimeMs: number
): Promise<void> {
  const newExpiresAt = new Date(Date.now() + additionalTimeMs);

  const { error } = await supabase
    .from("indexer_lock_queue")
    .update({
      expires_at: newExpiresAt.toISOString(),
    })
    .eq("lock_key", lockKey)
    .eq("status", "active");

  if (error) {
    console.error("Failed to renew lock:", error);
  }
}

async function releaseLock(lockKey: string): Promise<void> {
  const { error } = await supabase
    .from("indexer_lock_queue")
    .update({ status: "completed" })
    .eq("lock_key", lockKey)
    .eq("status", "active");

  if (error) {
    console.error("Failed to release lock:", error);
  }
}