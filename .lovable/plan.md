## Problem

The `upload_sessions` table has no foreign key constraints. The edge function's `validateSession` query uses `tenants!inner(name, slug, branding)` which relies on PostgREST detecting a FK relationship between `upload_sessions.tenant_id` and `tenants.id`. Without the FK, PostgREST can't resolve the join, the query errors, and the function returns "Invalid or expired upload link".

## Fix

### 1. Database migration: Add missing foreign keys

Add FK constraints for `tenant_id`, `app_id`, `created_by`, and `order_item_id` on `upload_sessions`:

```sql
ALTER TABLE public.upload_sessions
  ADD CONSTRAINT upload_sessions_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  ADD CONSTRAINT upload_sessions_app_id_fkey
    FOREIGN KEY (app_id) REFERENCES public.apps(id),
  ADD CONSTRAINT upload_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id),
  ADD CONSTRAINT upload_sessions_order_item_id_fkey
    FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);
```

### 2. Redeploy mobile-upload edge function

After the FK is in place, the existing edge function query will work as-is. Redeploy to clear any cached state.

### 3. Verify

Call the edge function with the active token to confirm it returns session info instead of the 404 error.
