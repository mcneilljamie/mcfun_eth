import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface LockResult {
  success: boolean;
  requestId?: string;
  acquiredImmediately?: boolean;
  queuePosition?: number;
  message?: string;
  error?: string;
  timeout?: boolean;
}

export interface LockCheckResult {
  success: boolean;
  acquired?: boolean;
  queuePosition?: number;
  message?: string;
  error?: string;
  timeout?: boolean;
}

export class LockManager {
  private supabase;
  private requestId: string | null = null;
  private lockKey: string;
  private renewalInterval: number | null = null;

  constructor(lockKey: string) {
    this.lockKey = lockKey;
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  async acquireLockWithQueue(timeoutSeconds: number = 300): Promise<LockResult> {
    try {
      const { data, error } = await this.supabase.rpc("acquire_lock_with_queue", {
        p_lock_key: this.lockKey,
        p_timeout_seconds: timeoutSeconds,
      });

      if (error) {
        console.error(`Error acquiring lock for ${this.lockKey}:`, error);
        return {
          success: false,
          error: error.message,
        };
      }

      const result = data as LockResult;

      if (result.success && result.requestId) {
        this.requestId = result.requestId;
      } else if (!result.success && result.requestId) {
        this.requestId = result.requestId;
        console.log(`Lock ${this.lockKey} is busy. Added to queue at position ${result.queuePosition}`);
      }

      return result;
    } catch (err) {
      console.error(`Exception acquiring lock for ${this.lockKey}:`, err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async waitForLock(pollIntervalMs: number = 3000, maxWaitMs: number = 300000): Promise<boolean> {
    if (!this.requestId) {
      console.error("No request ID available. Call acquireLockWithQueue first.");
      return false;
    }

    const startTime = Date.now();
    let attemptCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
      attemptCount++;

      const checkResult = await this.checkLockReady();

      if (checkResult.timeout) {
        console.error(`Lock wait timeout exceeded for ${this.lockKey}`);
        return false;
      }

      if (checkResult.error) {
        console.error(`Error checking lock status for ${this.lockKey}:`, checkResult.error);
        return false;
      }

      if (checkResult.acquired) {
        console.log(`Lock ${this.lockKey} acquired after ${attemptCount} attempts`);
        return true;
      }

      if (checkResult.queuePosition !== undefined) {
        console.log(`Still waiting for lock ${this.lockKey}. Queue position: ${checkResult.queuePosition}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    console.error(`Maximum wait time exceeded for lock ${this.lockKey}`);
    return false;
  }

  async checkLockReady(): Promise<LockCheckResult> {
    if (!this.requestId) {
      return {
        success: false,
        error: "No request ID available",
      };
    }

    try {
      const { data, error } = await this.supabase.rpc("check_queue_lock_ready", {
        p_request_id: this.requestId,
      });

      if (error) {
        console.error(`Error checking lock status for ${this.lockKey}:`, error);
        return {
          success: false,
          error: error.message,
        };
      }

      return data as LockCheckResult;
    } catch (err) {
      console.error(`Exception checking lock status for ${this.lockKey}:`, err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async releaseLock(): Promise<boolean> {
    if (!this.requestId) {
      console.warn(`No request ID to release for lock ${this.lockKey}`);
      return false;
    }

    try {
      this.stopRenewal();

      const { data, error } = await this.supabase.rpc("release_lock_and_advance_queue", {
        p_request_id: this.requestId,
      });

      if (error) {
        console.error(`Error releasing lock ${this.lockKey}:`, error);
        return false;
      }

      const result = data as { success: boolean; released: boolean };
      console.log(`Lock ${this.lockKey} released successfully`);

      this.requestId = null;
      return result.success;
    } catch (err) {
      console.error(`Exception releasing lock ${this.lockKey}:`, err);
      return false;
    }
  }

  async renewLock(extendMinutes: number = 5): Promise<boolean> {
    if (!this.requestId) {
      console.warn(`No request ID to renew for lock ${this.lockKey}`);
      return false;
    }

    try {
      const { data, error } = await this.supabase.rpc("renew_lock", {
        p_request_id: this.requestId,
        p_extend_minutes: extendMinutes,
      });

      if (error) {
        console.error(`Error renewing lock ${this.lockKey}:`, error);
        return false;
      }

      const result = data as { success: boolean; renewed: boolean };
      return result.success;
    } catch (err) {
      console.error(`Exception renewing lock ${this.lockKey}:`, err);
      return false;
    }
  }

  startAutoRenewal(intervalMs: number = 30000, extendMinutes: number = 5): void {
    if (this.renewalInterval !== null) {
      console.warn(`Auto-renewal already started for lock ${this.lockKey}`);
      return;
    }

    console.log(`Starting auto-renewal for lock ${this.lockKey} every ${intervalMs}ms`);

    this.renewalInterval = setInterval(async () => {
      const renewed = await this.renewLock(extendMinutes);
      if (!renewed) {
        console.warn(`Failed to renew lock ${this.lockKey}. Stopping auto-renewal.`);
        this.stopRenewal();
      }
    }, intervalMs);
  }

  stopRenewal(): void {
    if (this.renewalInterval !== null) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
      console.log(`Stopped auto-renewal for lock ${this.lockKey}`);
    }
  }

  async acquireOrWait(timeoutSeconds: number = 300): Promise<boolean> {
    const acquireResult = await this.acquireLockWithQueue(timeoutSeconds);

    if (acquireResult.success && acquireResult.acquiredImmediately) {
      console.log(`Lock ${this.lockKey} acquired immediately`);
      return true;
    }

    if (!acquireResult.success && acquireResult.error) {
      console.error(`Failed to acquire lock ${this.lockKey}:`, acquireResult.error);
      return false;
    }

    console.log(`Waiting for lock ${this.lockKey}...`);
    return await this.waitForLock(3000, timeoutSeconds * 1000);
  }
}

export async function withLock<T>(
  lockKey: string,
  operation: () => Promise<T>,
  options: {
    timeoutSeconds?: number;
    autoRenew?: boolean;
    renewIntervalMs?: number;
  } = {}
): Promise<T> {
  const {
    timeoutSeconds = 300,
    autoRenew = false,
    renewIntervalMs = 30000,
  } = options;

  const lockManager = new LockManager(lockKey);

  try {
    const acquired = await lockManager.acquireOrWait(timeoutSeconds);

    if (!acquired) {
      throw new Error(`Failed to acquire lock ${lockKey} within timeout`);
    }

    if (autoRenew) {
      lockManager.startAutoRenewal(renewIntervalMs);
    }

    const result = await operation();

    return result;
  } finally {
    await lockManager.releaseLock();
  }
}
