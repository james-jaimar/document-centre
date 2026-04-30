## The problem

You're in South Africa but the pricing page shows **"GBP (detected)"**. Two compounding bugs:

1. **CSP blocks the IP lookup.** `useRegionalPricing.ts` calls `https://ipapi.co/json/` to detect country. Our hardened CSP (`connect-src`) only whitelists Supabase and Tawk.to — so the fetch fails silently.
2. **The fallback lies.** When detection fails, the code still sets `detected = true` and shows the default region (GBP) with a "(detected)" badge. So it confidently displays the wrong country instead of an honest "we couldn't detect — pick yours".

This affects the Pricing page hero (your screenshot) and any other surface using `useRegionalPricing`.

## Fix — server-side detection via an Edge Function

Calling `ipapi.co` from the browser has three problems even if we whitelist it: (a) it expands attack surface in CSP, (b) free tier is rate-limited per visitor IP, (c) third-party JS hitting an IP-geo service is itself a mild reputation signal. Better to do it server-side where we can use Supabase's edge runtime headers.

### 1. New edge function: `detect-region`

`supabase/functions/detect-region/index.ts`

- Reads the visitor's country from request headers in this priority order:
  1. `cf-ipcountry` (Cloudflare, if ever proxied)
  2. `x-vercel-ip-country` / `x-nf-geo` (other CDN headers, harmless if absent)
  3. Deno's built-in `request.headers.get("x-forwarded-for")` → fall back to a server-side call to `https://ipapi.co/json/` from the edge (server IPs aren't rate-limited the same way, and it's not in the browser CSP)
- Returns `{ country_code: "ZA", source: "ipapi" | "header" | "default" }`
- Public function (no auth required) — read-only, no side effects
- Caches per-IP in-memory for the function instance lifetime to be polite to ipapi

### 2. Update `useRegionalPricing.ts`

- Replace `detectCountry()` to call `supabase.functions.invoke("detect-region")` instead of fetching ipapi directly from the browser
- **Critical bug fix**: only set `detected = true` when we actually got a country code AND it matched a region. If the country is unknown or unmatched, set `detected = false` so the UI doesn't claim a false detection.
- Keep the manual override (`localStorage.dc_region_override`) as-is — that flow is fine.

### 3. UI honesty in `Pricing.tsx`

- When `detected === false`, don't show the "(detected)" badge on any pill.
- Optionally show a small "Choose your region" hint above the pills if no detection succeeded.

### 4. CSP — leave it alone

No CSP changes needed. The browser only talks to Supabase (already whitelisted), and the edge function is the one talking to ipapi server-side.

### 5. About the `Permissions-Policy: geolocation=()` header

For clarity: this header is **not related** to the bug. It only blocks `navigator.geolocation.getCurrentPosition()` (the GPS popup), which the pricing page does not use. IP-based region detection is unaffected by it. I'm leaving `geolocation=()` as-is unless you tell me you have a "use my location" feature planned.

## Files I'll touch

- `supabase/functions/detect-region/index.ts` — new edge function
- `supabase/config.toml` — register the function as `verify_jwt = false` (public)
- `src/hooks/useRegionalPricing.ts` — switch to edge function, fix false `detected` flag
- `src/pages/Pricing.tsx` — only show "(detected)" badge when truly detected

## Verification after deploy

1. Hard-reload pricing page from a SA IP → should show **ZAR (detected)** instead of GBP.
2. Manually click GBP pill → "(detected)" badge disappears, GBP becomes selected, override persists across reloads.
3. Click "Reset" (or clear `localStorage.dc_region_override`) → back to ZAR detection.
4. From a UK VPN → GBP (detected). From US → USD (detected). From India (no matching region) → default region shown but **without** the (detected) badge.

## Out of scope

- Changing the default region in `platform_pricing_regions` (still GBP for now — that just affects users we can't detect). If you'd rather it default to ZAR, say the word and I'll flip it via migration.
