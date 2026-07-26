## Problem

Downloading branch pricing fails with a CORS error in the browser, but the actual issue is that the `branch-pricing-workbook` edge function returns **`404 NOT_FOUND`** from the Supabase gateway. Direct curl against both `OPTIONS` and `GET` on `https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/branch-pricing-workbook` returns `sb-error-code: NOT_FOUND`. Because the 404 has no CORS-compliant status on the preflight, Chrome surfaces it as "Response to preflight request doesn't pass access control check".

The function source exists at `supabase/functions/branch-pricing-workbook/index.ts` with correct `corsHeaders` (`*` origin, allowed headers include `authorization, x-client-info, apikey, content-type`, allowed methods `GET, POST, OPTIONS`). It simply was never deployed.

## Fix

1. Deploy `branch-pricing-workbook` via `supabase--deploy_edge_functions`.
2. Re-run the same `OPTIONS` preflight and `GET ?action=export` curl against the deployed URL and confirm both return `200/2xx` with `access-control-allow-origin: *`.
3. In the browser preview (branch portal → Pricing), click **Download pricing (.xlsx)** and confirm the file downloads. Then upload it back to confirm `preview` + `apply` paths also work end-to-end (they share the same function, so once deployed all four actions come online).

## Not doing

- No code changes to the function, the client component (`BranchPricingIO.tsx`), or `supabase/config.toml` — the CORS wiring is already correct; the function just needs to exist on the gateway.
- No change to auth/JWT settings — the client sends `Authorization` + `apikey`, which the function already validates in-code.
