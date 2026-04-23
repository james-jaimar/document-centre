

## Fix IP geolocation: switch from ip-api.com to an HTTPS-compatible API

### Problem

`ip-api.com` only supports HTTPS on its paid tier. The free tier only works over HTTP, which is blocked by browsers as mixed content when the site is served over HTTPS. This is why the request returns 403.

### Fix

Replace the `ip-api.com` call with `https://ipapi.co/json/` (free, HTTPS, no API key needed, 1000 req/day). The response shape differs slightly (`country_code` instead of `countryCode`).

### Change

**File: `src/hooks/useRegionalPricing.ts`** (line 41)

Replace:
```typescript
const res = await fetch("https://ip-api.com/json/?fields=countryCode", {
  signal: AbortSignal.timeout(3000),
});
if (!res.ok) return null;
const data = await res.json();
const code = data.countryCode as string;
```

With:
```typescript
const res = await fetch("https://ipapi.co/json/", {
  signal: AbortSignal.timeout(3000),
});
if (!res.ok) return null;
const data = await res.json();
const code = data.country_code as string;
```

Single file, single line-group change. Everything else (caching, fallback, override logic) stays the same.

