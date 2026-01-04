/**
 * Rate limiting utilities for Supabase Edge Functions
 * Uses database-backed rate limiting for accurate tracking across function invocations
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
}

/**
 * Check if a request should be rate limited
 *
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param endpoint - Name of the endpoint being called
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns RateLimitResult indicating if request is allowed
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  maxRequests: number = 10,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error("Rate limit check failed:", error);
      // Fail open on error to prevent blocking legitimate requests
      return { allowed: true };
    }

    if (!data) {
      return {
        allowed: false,
        error: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowSeconds} seconds.`,
      };
    }

    return { allowed: true };
  } catch (err: any) {
    console.error("Rate limit check error:", err);
    // Fail open on error
    return { allowed: true };
  }
}

/**
 * Create a rate limited response
 *
 * @param message - Error message
 * @param corsHeaders - CORS headers to include
 * @returns Response object
 */
export function createRateLimitResponse(
  message: string,
  corsHeaders?: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      retryAfter: 60,
    }),
    {
      status: 429,
      headers: {
        ...(corsHeaders || {}),
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    }
  );
}
