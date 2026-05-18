# Phase 3 — Storage bucket path-based ownership

Tightens the three remaining buckets that currently have blanket policies. No frontend changes; all enforcement moves into RLS on `storage.objects`.

## Buckets in scope

| Bucket | Public | Current real usage | New rule |
|---|---|---|---|
| `documents` | private | 55 objects under `invoices/{tenant_id}/…` | Read = tenant members + platform admin; Write = platform admin + service role |
| `document-uploads` | private | 0 objects (real customer files live in S3) | Path `{user_id}/…` enforced for SELECT/INSERT/UPDATE/DELETE; platform admin override stays |
| `assets` | public | 0 objects | Public SELECT stays; INSERT/UPDATE/DELETE restricted to platform admin |

## Migration

Drop these existing storage.objects policies (they're too broad):
- `Authenticated users can read documents`
- `Users can view own documents` / `Users can upload own documents` / `Users can delete own documents`
- `Authenticated users can upload assets`

Add new policies on `storage.objects`:

**documents bucket** — only `invoices/{tenant_id}/…` paths are used today, so policies key off `(storage.foldername(name))[2]::uuid` as the tenant id, with `(storage.foldername(name))[1] = 'invoices'` as the prefix check:
- SELECT: `bucket_id = 'documents' AND (storage.foldername(name))[1] = 'invoices' AND EXISTS(tenant_memberships where profile_id = auth.uid() and tenant_id = ((storage.foldername(name))[2])::uuid and is_active)` OR `has_role(auth.uid(), 'platform_admin')`
- INSERT/UPDATE/DELETE: `has_role(auth.uid(), 'platform_admin')` only (invoices are system-generated)

**document-uploads bucket** — empty, so we can pick the canonical scheme now:
- SELECT/INSERT/UPDATE/DELETE: `bucket_id = 'document-uploads' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'platform_admin'))`

**assets bucket** — keep `Anyone can view assets` (intentional CDN), add:
- INSERT/UPDATE/DELETE: `bucket_id = 'assets' AND has_role(auth.uid(), 'platform_admin')`

`pdf-server` (service role) bypasses RLS, so worker writes to any bucket continue to work.

## Verification after migration

1. Platform admin opens an invoice PDF from Admin → Billing → still loads.
2. Tenant Owner/Admin opens their own invoice → still loads.
3. Customer from a different tenant tries the same signed URL → 403.
4. Storefront landing + photo prints + product pages on `/t/demo/…` → still render (none use these buckets, but worth a click-through).
5. Platform → Document Centre ops dashboards → still load (uses service role).

## Out of scope (kept for Phase 4)

- `tenants` column-restricted public view
- Realtime channel authorisation
- `SECURITY DEFINER` function audit (`current_storefront_tenant_id`, vault wrappers, etc.)
- Frontend changes

After Phase 3 ships and you've sanity-checked, we move to Phase 4.
