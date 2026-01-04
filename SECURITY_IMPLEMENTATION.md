# Edge Function Security Implementation

## Overview

This document describes the security measures implemented to protect Supabase Edge Functions from unauthorized access, DoS attacks, and abuse.

## Problem Statement

Previously, all edge functions were publicly accessible without authentication, allowing anyone to:
- Call cron-only functions directly, bypassing scheduled execution
- Burn through RPC quota by making unlimited requests
- Spike Supabase function invocation costs
- Potentially cause data corruption through concurrent unauthorized executions
- DoS the entire data pipeline

## Security Solutions Implemented

### 1. Authentication for Cron-Only Functions

All cron-only edge functions now require a secret header to execute. These functions include:
- event-indexer
- lock-event-indexer
- burn-event-indexer
- price-snapshot
- sync-reserves
- track-eth-price
- detect-indexer-gaps
- detect-lock-gaps
- sync-lock-withdrawals
- All backfill functions (backfill-eth-prices, backfill-missing-swaps, backfill-swap-snapshots, backfill-token-history)
- interpolate-snapshots
- sync-token-metadata
- generate-initial-history

**Authentication Method:**
- Functions check for `CRON_SECRET` environment variable
- Requests must include one of these headers:
  - `X-Cron-Secret: <secret>`
  - `Authorization: Bearer <secret>`
  - `X-Secret: <secret>`
- Uses constant-time comparison to prevent timing attacks
- Returns 401/403 if authentication fails

**Security Features:**
- Fail-closed: If `CRON_SECRET` is not configured, all requests are denied
- Constant-time string comparison prevents timing attacks
- Logs all unauthorized access attempts
- Removed wildcard CORS (Access-Control-Allow-Origin: *) from cron functions

### 2. Rate Limiting for Public Functions

The `register-token-launch` function (called from frontend) now has rate limiting:
- Maximum 5 requests per IP address per 60 seconds
- Uses database-backed tracking for accuracy across function invocations
- Returns 429 status code when rate limit is exceeded
- Includes `Retry-After` header
- Maintains CORS support for frontend access

**Rate Limiting Features:**
- Sliding window algorithm for accurate tracking
- Automatic cleanup of old rate limit records
- Tracks by IP address extracted from headers (x-forwarded-for, x-real-ip, cf-connecting-ip, etc.)
- Fails open if rate limit check errors (prevents blocking legitimate traffic)

### 3. Database Infrastructure

Created `rate_limits` table with:
- Composite indexes for fast lookups
- RLS enabled with service-role-only access
- Automatic cleanup cron job (runs every 10 minutes)
- Sliding window tracking per identifier/endpoint combination

Created helper functions:
- `check_rate_limit(identifier, endpoint, max_requests, window_seconds)`: Returns boolean
- `cleanup_old_rate_limits()`: Removes records older than 1 hour

## Configuration Required

### Step 1: Generate CRON_SECRET

Generate a strong random secret (32+ characters):

```bash
# Using OpenSSL (recommended)
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 2: Set Environment Variable in Supabase

1. Go to your Supabase project dashboard
2. Navigate to Project Settings → Edge Functions → Secrets
3. Add a new secret:
   - Name: `CRON_SECRET`
   - Value: (paste the generated secret)
4. Save the secret

### Step 3: Update Cron Job Configurations

All external cron job callers (GitHub Actions, Vercel Cron, EasyCron, etc.) must include the secret header:

```bash
# Example cURL request
curl -X POST https://your-project.supabase.co/functions/v1/event-indexer \
  -H "X-Cron-Secret: YOUR_CRON_SECRET_HERE" \
  -H "Content-Type: application/json"
```

**For Supabase built-in cron jobs (pg_cron):**
The cron jobs configured via SQL migrations automatically have access to environment variables through the service role key. Update the HTTP requests in your cron job migrations to include the secret header:

```sql
-- Example: Update cron job to include authentication
SELECT cron.schedule(
  'event-indexer',
  '*/60 * * * *',
  $$SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/event-indexer'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.service_role_key')),
      'X-Cron-Secret', (SELECT current_setting('app.settings.cron_secret'))
    ),
    body := '{}'::jsonb
  );$$
);
```

## Testing Authentication

### Test Cron Function Without Auth (Should Fail)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/price-snapshot \
  -H "Content-Type: application/json"

# Expected response:
# {"error":"Authentication required"}
# Status: 401
```

### Test Cron Function With Auth (Should Succeed)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/price-snapshot \
  -H "X-Cron-Secret: YOUR_CRON_SECRET_HERE" \
  -H "Content-Type: application/json"

# Expected response:
# {snapshotsCreated: X, tokensProcessed: Y, ...}
# Status: 200
```

### Test Rate Limiting (Public Function)

```bash
# Make 6 requests rapidly to trigger rate limit
for i in {1..6}; do
  curl -X POST https://your-project.supabase.co/functions/v1/register-token-launch \
    -H "Content-Type: application/json" \
    -d '{"txHash":"0x...","tokenAddress":"0x...","ammAddress":"0x...","name":"Test","symbol":"TEST"}'
done

# 6th request should return:
# {"error":"Rate limit exceeded...","retryAfter":60}
# Status: 429
```

## Security Best Practices

1. **Keep CRON_SECRET Secure**
   - Never commit the secret to version control
   - Rotate the secret periodically (every 90 days recommended)
   - Use different secrets for different environments (dev, staging, prod)

2. **Monitor for Abuse**
   - Check logs regularly for unauthorized access attempts
   - Monitor function invocation counts for anomalies
   - Set up alerts for excessive 429 (rate limit) responses

3. **Adjust Rate Limits**
   - Current limit: 5 requests per 60 seconds for register-token-launch
   - Adjust based on legitimate usage patterns
   - Consider per-user rate limits if you implement user authentication

4. **Regular Security Audits**
   - Review function access patterns monthly
   - Check for any functions that should be protected but aren't
   - Update security measures as threats evolve

## Files Modified

### New Files Created
- `supabase/functions/_shared/auth.ts`: Authentication utilities
- `supabase/functions/_shared/rateLimit.ts`: Rate limiting utilities
- `supabase/migrations/[timestamp]_create_rate_limiting_infrastructure.sql`: Database setup

### Functions Updated
All cron-only functions now include authentication checks at the start of their handlers.
The register-token-launch function now includes rate limiting.

## Rollback Procedure

If authentication causes issues:

1. **Temporary Fix**: Set `CRON_SECRET` in Supabase to an empty string (this will make functions fail-closed)

2. **Full Rollback**: Remove authentication checks from functions by reverting these imports:
   ```typescript
   // Remove these lines
   import { verifyCronSecret, createUnauthorizedResponse } from "../_shared/auth.ts";

   // Remove auth check block
   const authResult = verifyCronSecret(req);
   if (!authResult.authorized) {
     // ...
   }
   ```

3. **Redeploy** affected functions

## Future Enhancements

Consider implementing:
1. JWT-based authentication for more sophisticated access control
2. Per-user rate limiting (once user authentication is added)
3. IP whitelisting for additional protection
4. Request signing to prevent replay attacks
5. Automated secret rotation
6. Security monitoring dashboard
7. Integration with external security services (Cloudflare, etc.)

## Support

For security concerns or questions, review the security implementation in:
- `/supabase/functions/_shared/auth.ts`
- `/supabase/functions/_shared/rateLimit.ts`
- This document

---

**Last Updated**: January 4, 2026
**Security Version**: 1.0
