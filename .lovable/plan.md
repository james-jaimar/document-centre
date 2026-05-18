## Security findings — triage & fix plan

I went through every finding, looked at how each table/policy is used in the app and in the `pdf-server` (FastAPI worker that backs document processing), and grouped fixes by **risk of breaking the app**. The pdf-server connects with `DATABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, so enabling RLS on the tables it writes to (assets / derived_files / jobs / job_events / ops_*) will **not** affect it — service role bypasses RLS.

No frontend or edge function in this codebase reads from those ops tables, so locking them down is safe.

---

### Phase 1 — Zero-risk fixes (just enable RLS, no code changes)

These tables are written/read only by `pdf-server` via service role. Nothing in the React app or edge functions queries them.

1. **`assets`** — enable RLS; allow read for platform admins + tenant staff via a join through `order_documents → orders`. Write/update: deny to everyone (service role only).
2. **`derived_files`** — same model: enable RLS, SELECT via join to owning `assets` row.
3. **`jobs`** — enable RLS, SELECT for platform admins + tenant staff via `asset_id → order_documents → orders.tenant_id`.
4. **`job_events`** — enable RLS, SELECT for platform admins only (worker diagnostics).
5. **`ops_audit_log`** — enable RLS, SELECT/ALL for platform admins only.
6. **`ops_storage_snapshots`** — enable RLS, SELECT for platform admins only.

**Why safe:** service role bypasses RLS, and Platform Ops UI (`PlatformDocumentCentre*` pages) already filters by `has_role('platform_admin')`.

---

### Phase 2 — Low-risk policy tightening (code unchanged, but verify)

7. **`branch_capabilities` — anon read scoped to current storefront tenant.**
   Replace `branch_capabilities_public_read USING (is_enabled = true)` with a policy that also requires the branch's tenant_id to equal `current_storefront_tenant_id()`. Storefront already sets the `x-storefront-tenant` header via `installStorefrontTenantHeader`, so this won't break customer browsing.

8. **`product_families` — anon read scoped to storefront tenant or global rows.**
   Tighten `product_families_public_read` so anon only sees rows where `tenant_id IS NULL` (platform templates) OR `tenant_id = current_storefront_tenant_id()`. Authenticated path is unchanged.

9. **`platform_promo_codes` — remove the broad authenticated read.**
   Drop `promo_codes_authenticated_select`. Only the platform admins screen reads this; the existing platform-admin policy already covers it. Add a dedicated `validate-promo-code` edge function (service role) to be called when a customer enters a code at checkout — returns just `valid/discount`, not the full row. No customer screen currently reads from this table, so no immediate UI breakage.

10. **`ops_storage_snapshots`** is already covered in Phase 1.

---

### Phase 3 — Storage-bucket policies (touch carefully, verify after each)

11. **`documents` bucket — path-based ownership.**
    Today: any authenticated user can read every file in the bucket. Files are stored under `{tenant_id}/orders/{order_id}/...`. New policy: read only if `(storage.foldername(name))[1]::uuid` matches a tenant the user is a member of OR they are the customer who owns the order. Replace the current blanket `Authenticated users can read documents` policy. **Risk:** existing files use multiple path layouts — must audit before rolling out. The `document-access` edge function (service role) is the primary serving path and is unaffected.

12. **`document-uploads` bucket — path-based ownership.**
    Replace `auth.uid() IS NOT NULL` checks with `(storage.foldername(name))[1] = auth.uid()::text` on SELECT and DELETE. Today uploads go to `{user_id}/...` so this should be safe, but I need to confirm by sampling `storage.objects.name` patterns first.

13. **`assets` bucket — tenant-prefix upload check.**
    Add `WITH CHECK ((storage.foldername(name))[1]::uuid = get_user_tenant_id(auth.uid()))` to the upload policy. Tenant branding assets already live under `{tenant_id}/...`.

---

### Phase 4 — Bigger refactors (requires code changes; staged separately)

14. **`tenants` — column-restricted anon view.**
    `tenants_public_read_active` currently exposes `vat_number`, `billing_email`, `workflow_template`, `payment_mode`, `proof_mode`, `plan_slug`, `onboarding_status`, etc. to anon. Fix:
    - Drop the anon SELECT policy on `tenants`.
    - Create a `public.tenants_public` view selecting only `id, name, slug, logo_url, custom_domain, app_id, is_demo, is_active, country, locale, default_currency, support_email, support_phone, website_url, settings`. Grant SELECT to `anon, authenticated`.
    - Repoint anon-side callers: `useTenantFromSlug`, `useTenantFromHost`, `useTenantContext` (slug branch), `StorefrontRedirect`.
    - Admin/staff queries continue to use `tenants` directly (covered by `tenants_select_membership` / platform admin policies).

15. **`documents` table — Realtime channel authorization.**
    Add a policy on `realtime.messages` so subscribers can only listen to `documents:order_id={uuid}` topics for orders they can read. Requires verifying the channel naming convention used by the frontend first.

16. **`SECURITY DEFINER` functions exposed to anon/authenticated** (Supabase linter 0028 / 0029).
    Audit `public` functions — for each, decide REVOKE EXECUTE FROM anon/authenticated, switch to SECURITY INVOKER, or leave (e.g. `current_storefront_tenant_id` legitimately needs anon EXECUTE). Need an item-by-item pass.

17. **Auth provider settings (not in code):**
    - Enable "Leaked password protection" in Auth → Providers → Email.
    - These are dashboard toggles, not migrations.

---

### Findings I propose to **not** change

- **`previews` and `tenant-assets` buckets being publicly readable** — these are intentionally public (cover thumbnails, tenant logos shown to anonymous storefront visitors). Listed by linter 0025 as warnings; mark as accepted in the security memory.
- **Anonymous sign-in policies (linter warning)** — anonymous sessions are core to the customer storefront flow (see `anonymous-session-bootstrap` memory). Already documented; will reflect in security memory.

---

### Execution order I recommend

1. Phase 1 migration (RLS on 6 ops tables) — ship & verify Platform Ops pages still load.
2. Phase 2 migration (anon policy tightening on 3 tables) — verify customer storefront still browses products.
3. Phase 3 migration (storage policies) — after sampling `storage.objects.name` patterns.
4. Phase 4 (the `tenants` view refactor + Realtime + DEFINER audit) — separate, larger change with code edits and tests.

If you approve, I'll start with **Phase 1 + Phase 2** in a single migration (lowest risk, biggest finding-count reduction), then come back for Phase 3 after I verify the storage path patterns. Phase 4 I'd queue as a separate session because it touches frontend code and needs more testing.

Tell me if you'd like me to (a) do Phase 1 + 2 now, (b) do Phase 1 only and pause, or (c) tackle all four phases in sequence.
