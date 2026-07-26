## What's actually happening

- The rows exist (`8edbab41…` = master Foil Stamping Gold, `c497abe7…` = master Embossing).
- Nothing blocks them at the DB layer: no FK references in `product_catalog_links`, `catalog_finishing_prices` cascades, only touch/cleanup triggers, GRANTs are fine.
- PostgREST returning **404** on a `?id=eq.<uuid>` DELETE means "RLS filtered every candidate row." The only DELETE policies on `catalog_finishing` are `platform_admin` / tenant-admin / branch-admin. So the request that reached PostgREST was NOT recognised as `platform_admin` — even though you're signed into the UI as `james@jaimar.dev`.
- The delete hook (`useDeleteCatalogFinishing`) and its caller `removeFin` in `PlatformCatalog.tsx` swallow the error — no toast, no re-throw — which is why it looked like "no error, just nothing happens."
- There is also an open row in `impersonation_sessions` (never `ended_at`). The Supabase client isolates impersonation into `sessionStorage` under a different storage key (`src/integrations/supabase/client.ts`). If that flag is ever set on a tab, that tab reads from an empty/stale key and effectively runs as `anon` — SELECTs still work (public read policy), but every write silently 404s.

## Fix (frontend-only, no schema changes)

1. **Surface the real error in the UI.** Update `useDeleteCatalogFinishing` (and its `sizes`/`papers`/`print_attrs` siblings in `src/hooks/useCatalog.ts`) to:
   - Chain `.select('id')` after `.delete().eq('id', id)` so PostgREST returns the deleted row.
   - If no row is returned, throw a typed `CatalogDeleteBlockedError` with a message like "Row could not be deleted — either it doesn't exist or your session isn't authorised (platform_admin required)."
   - Detect PostgREST codes `PGRST116` / HTTP 404 as the same "blocked / not visible" case.
2. **Show the error to the operator.** In `PlatformCatalog.tsx` (and the equivalent tenant / branch catalog pages), wrap each `remove*` call in `try/catch` and pipe the message into the existing `toast` helper — success and failure both.
3. **Diagnose and clear the stuck session state.** Add a one-shot dev helper (guarded, logs only in dev / when `?debug=auth`) that logs on mount of `/platform`:
   - `auth.getUser()` email
   - `sessionStorage['dc.impersonation.tab']`
   - which storage key the client is actually reading from
   Also add an "Exit impersonation" safety net: on `/platform` mount, if `dc.impersonation.tab === '1'` but no impersonation state exists, clear the flag and reload so subsequent writes use the normal `sb-…-auth-token` session.
4. **End the stale impersonation row.** From the platform admin's Impersonation page (or via a one-off admin action), close `impersonation_sessions.id = d88cc220-852f-4bc9-a5e7-48f4e6925ae3` with `ended_reason = 'stale-cleanup'` so any lingering audit UI reflects reality. Pure data cleanup — no schema change.

## Verification

- After (1)+(2): retry the delete on Foil Stamping Gold. Either it succeeds (row goes away, success toast) or you get an explicit toast naming the reason.
- After (3): the `/platform` debug log will show whether the tab is using the impersonation storage key. If it is, the reload path drops it and the same delete then succeeds under `james@jaimar.dev`.
- After (4): `SELECT count(*) FROM impersonation_sessions WHERE ended_at IS NULL` returns 0.

## Out of scope

- No RLS policy changes (existing platform_admin DELETE policy is correct).
- No changes to `catalog_finishing`, `catalog_finishing_prices`, or `product_catalog_links` schema/triggers.
- No changes to the impersonation edge functions themselves — only the client-side stuck-flag recovery.
