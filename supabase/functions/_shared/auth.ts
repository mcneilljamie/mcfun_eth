/**
 * Authentication utilities for Supabase Edge Functions
 * Provides security mechanisms to prevent unauthorized access and DoS attacks
 */

export interface AuthResult {
  authorized: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Verify that the request includes a valid cron secret header
 * Used for cron-only functions that should not be publicly accessible
 *
 * @param req - The incoming request
 * @returns AuthResult indicating if the request is authorized
 */
export function verifyCronSecret(req: Request): AuthResult {
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Check multiple possible header names for flexibility
  const providedSecret =
    req.headers.get("X-Cron-Secret") ||
    req.headers.get("Authorization")?.replace("Bearer ", "") ||
    req.headers.get("X-Secret");

  if (!providedSecret) {
    console.warn("Request missing authentication header");
    return {
      authorized: false,
      error: "Authentication required",
      statusCode: 401,
    };
  }

  // Accept CRON_SECRET if configured
  if (expectedSecret && constantTimeCompare(providedSecret, expectedSecret)) {
    return { authorized: true };
  }

  // Accept Supabase anon key (for internal cron jobs)
  if (anonKey && constantTimeCompare(providedSecret, anonKey)) {
    return { authorized: true };
  }

  // Accept Supabase service role key
  if (serviceKey && constantTimeCompare(providedSecret, serviceKey)) {
    return { authorized: true };
  }

  console.warn("Invalid authentication secret provided");
  return {
    authorized: false,
    error: "Invalid authentication",
    statusCode: 403,
  };
}

/**
 * Constant-time string comparison to prevent timing attacks
 * Always compares all characters even if an early mismatch is found
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Create an unauthorized response with appropriate headers
 *
 * @param error - Error message to return
 * @param statusCode - HTTP status code (default: 401)
 * @param corsHeaders - CORS headers to include (optional)
 * @returns Response object
 */
export function createUnauthorizedResponse(
  error: string,
  statusCode: number = 401,
  corsHeaders?: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({ error }),
    {
      status: statusCode,
      headers: {
        ...(corsHeaders || {}),
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Get the IP address from the request for rate limiting
 *
 * @param req - The incoming request
 * @returns IP address or "unknown"
 */
export function getClientIP(req: Request): string {
  // Check various possible headers for the client IP
  const headers = req.headers;

  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") || // Cloudflare
    headers.get("x-client-ip") ||
    "unknown"
  );
}
