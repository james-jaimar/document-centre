## Root cause

The Postnet/Document Centre Demo storefronts went blank because `SubdomainWrapper` (which wraps the *entire* route tree in `App.tsx`) renders only a full-screen spinner while `useTenantFromHost().loading === true`. That hook does:

```ts
const { data } = await supabase.from("tenants")...maybeSingle();
...
setLoading(false);
```

with **no try/catch**. The Supabase request to `/rest/v1/tenants?custom_domain=in.(...)` failed with `net::ERR_FAILED` (confirmed in the browser network log just now — the GET errored while the OPTIONS preflight 204'd separately). The throw bypassed `setLoading(false)`, so the spinner sticks forever. No frontend code was changed in the recent deploy — this is a long-standing fragility that a transient network blip exposed today.

`useTenantFromSlug` and `useTenantBranding` have the exact same shape and feed `CustomerLayout`'s `brandingReady` gate, so they can also blank the page on a single failed fetch.

## Fix

Make the three tenant bootstrap hooks fail-safe: they must always settle `loading=false`, even when the network call throws, and they should retry once on transient errors before giving up. The UI should fall through to "no tenant matched" instead of an infinite spinner.

### 1. `src/hooks/useTenantFromHost.ts`
- Wrap the entire `resolve()` body in `try { … } catch (e) { console.warn(...) } finally { setLoading(false) }`.
- Add a single silent retry (250 ms back-off) for network-class errors before the catch.
- On final failure, leave `matched=false, tenant=null` so the app falls through to path-based routing / marketing landing.

### 2. `src/hooks/useTenantFromSlug.ts`
- Same try/catch/finally pattern around the fetch.
- Single retry on network error.
- On failure: keep any cached `tenant` from localStorage if present; only surface `error` when there is no cache to render from.

### 3. `src/hooks/useTenantBranding.ts` (verify; likely already a `useQuery` with built-in retry — confirm `retry: 1` and `staleTime` so a failure doesn't permanently lock `brandingReady=false`).

### 4. `src/components/CustomerLayout.tsx`
- `brandingReady` currently waits on both `tenantLoading` *and* `brandingLoading`. Add a safety timeout (e.g. 4 s) so even if branding never resolves, the layout proceeds with default styling rather than staying on the splash forever.

### 5. `src/components/SubdomainRouter.tsx`
- Add the same 4 s safety timeout to the SubdomainWrapper loading guard so a stuck host lookup can never blank the entire app — render children with `matched=false` after the timeout.

## Out of scope

- No backend, pdf-server, or migration changes.
- No change to the storefront-tenant header interceptor (it correctly no-ops when no tenant is set, and the preflight log confirms it wasn't the cause).
- No change to routing or auth.

## Verification

1. Reload `/t/postnet` in preview — page should render (header + sidebar) within ~2 s.
2. In DevTools, block requests to `lcvdhtaqoumyokjqaqfw.supabase.co/rest/v1/tenants*` and reload — the app should still render (fall through to default theme / no-tenant state) instead of showing an infinite spinner.
3. `postnet.document-centre.com` on production after Amplify redeploy — same behaviour.

Expected outcome: no transient Supabase error can ever leave the app on a blank loading spinner again.
