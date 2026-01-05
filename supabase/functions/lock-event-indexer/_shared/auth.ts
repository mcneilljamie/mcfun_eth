export interface AuthResult { authorized: boolean; error?: string; statusCode?: number; }

export function verifyCronSecret(req: Request): AuthResult {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const providedSecret = req.headers.get("Authorization")?.replace("Bearer ", "") || req.headers.get("X-Cron-Secret") || req.headers.get("X-Secret");
  if (!providedSecret) { console.warn("Request missing authentication header"); return { authorized: false, error: "Authentication required", statusCode: 401 }; }
  if (anonKey && constantTimeCompare(providedSecret, anonKey)) { return { authorized: true }; }
  if (serviceKey && constantTimeCompare(providedSecret, serviceKey)) { return { authorized: true }; }
  if (!anonKey && !serviceKey) { console.warn("Environment variables not set, allowing request (development mode)"); return { authorized: true }; }
  console.warn("Invalid authentication secret provided"); return { authorized: false, error: "Invalid authentication", statusCode: 403 };
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) { return false; }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) { mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i); }
  return mismatch === 0;
}

export function createUnauthorizedResponse(error: string, statusCode: number = 401, corsHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), { status: statusCode, headers: { ...(corsHeaders || {}), "Content-Type": "application/json" } });
}

export function getClientIP(req: Request): string {
  const headers = req.headers;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || headers.get("cf-connecting-ip") || headers.get("x-client-ip") || "unknown";
}
