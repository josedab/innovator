/**
 * Shared HTTP response headers for API routes.
 * Centralizes security and cache headers to avoid duplication.
 */

/** Cache-busting headers to prevent intermediary caching of API responses. */
export const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Vary: "Accept-Encoding",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/** Defense-in-depth security headers for API responses. */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
} as const;

/** Combined headers for JSON API responses. */
export const API_RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  ...CACHE_HEADERS,
  ...SECURITY_HEADERS,
} as const;
