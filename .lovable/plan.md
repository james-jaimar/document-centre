

## Fix: S3 Bucket Folder Structure for Multi-Tenant Isolation

### Problem
You're right — the current S3 paths have two issues:

1. **User uploads** go to `{user_id}/{order_item_id}/{filename}` — no tenant grouping, so all tenants' files mix together at the root
2. **VPS-generated files** (`normalized/`, `previews/`, `thumbnails/`) dump directly at the bucket root — these will also grow unbounded

With multiple tenants, this becomes thousands of top-level folders with no way to audit, manage, or clean up per-tenant.

### Proposed Path Structure

```text
tenants/{tenant_id}/uploads/{user_id}/{order_item_id}/{filename}
tenants/{tenant_id}/normalized/{asset_id}.pdf
tenants/{tenant_id}/previews/{kind}/{asset_id}.png
tenants/{tenant_id}/thumbnails/{kind}/{asset_id}.png
```

This gives:
- Clean per-tenant isolation in S3
- Easy IAM policy scoping if needed later
- Simple lifecycle rules per tenant prefix
- Audit/cleanup by tenant

### Changes Required

**1. Frontend: `src/hooks/useDocumentUpload.ts`**
- Import `useTenantContext` to get `tenantId`
- Change path from `${user.id}/${effectiveId}/${safeFileName}` to `tenants/${tenantId}/uploads/${user.id}/${effectiveId}/${safeFileName}`
- The hook's parent component already has tenant context available

**2. VPS: `storage.py` (you'll do this on the server)**
- When the worker downloads the source file, the `source_storage_path` already contains the full key — no change needed for downloads
- For **writing** normalized/preview/thumbnail files, prefix with `tenants/{tenant_id}/` instead of writing to root-level `normalized/`, `previews/`, `thumbnails/`
- The `tenant_id` would need to be passed through the asset metadata or looked up from the `documents` table via `backend_asset_id`

**3. VPS: Asset creation API**
- The `createAsset` call already passes `source_storage_path` — this will automatically use the new prefixed path
- The VPS needs to derive the tenant prefix for output files (normalized, previews, thumbnails)

### Migration Consideration
- Existing files in the bucket (from testing) can be manually moved or left as-is
- New uploads will use the new structure immediately
- No database migration needed — `file_path` in `documents` already stores the full S3 key

### Scope
- One Lovable file changed: `src/hooks/useDocumentUpload.ts`
- VPS changes: `storage.py` output path logic (you'll handle on server)
- No edge function changes needed

