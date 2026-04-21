

## Bug — `scrape-branding` edge function throws `getClaims is not a function`

### Symptom
Tenant admin clicks "Import" on `https://postnet.co.za` in Branding tab → toast: "Edge Function returned a non-2xx status code".

### Root cause (verified from logs)
```
scrape-branding error: TypeError: supabase.auth.getClaims is not a function
```

`supabase/functions/scrape-branding/index.ts` line 41-42 calls `supabase.auth.getClaims(token)`. That method does not exist in `@supabase/supabase-js@2.49.1`. The function never reaches the Firecrawl call.

This is also a violation of the project's existing **Edge Function Standards** memory which mandates `supabase.auth.getUser()` for auth verification across all edge functions.

### Fix

Replace the auth block in `supabase/functions/scrape-branding/index.ts`:

```ts
const { data: { user }, error: authError } = await supabase.auth.getUser();
if (authError || !user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Remove the now-unused `token` variable and the `getClaims` call.

### While we're in there — small hardening

1. Bump the SDK pin from `@2.49.1` to `@2.57.4` (the version used by other edge functions in this project) for consistency.
2. Add an explicit `console.error` already exists at the catch — keep it.
3. Confirm `FIRECRAWL_API_KEY` secret is present (it is — visible in the secrets list).

### Files

- `supabase/functions/scrape-branding/index.ts` — swap `getClaims` → `getUser`, align SDK version.

### Verification

1. Redeploy `scrape-branding`.
2. As tenant admin in PostNet → Settings → Branding → enter `https://postnet.co.za` → click Import.
3. Toast: "Branding imported! Review and save." Fields populate (colors, logo, fonts, title, description).
4. Edge function logs show no `TypeError`; show one successful Firecrawl call.
5. As an unauthenticated request (no Bearer token) → 401 Unauthorized still returned.

### Out of scope

- Changing what fields Firecrawl returns or how they map to `tenant_settings`.
- Auto-saving — current flow correctly stages values for the user to review and click Save.

