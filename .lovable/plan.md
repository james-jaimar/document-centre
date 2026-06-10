## Fix platform email connect

**Root cause:** `email_accounts.tenant_id` is `NOT NULL`, so the platform OAuth callback (which inserts a row with `tenant_id = NULL`) fails. RLS policies already handle the NULL case via `platform_admin` policies.

**Change:** Single migration:

```sql
ALTER TABLE public.email_accounts ALTER COLUMN tenant_id DROP NOT NULL;
```

No code changes — the edge function and UI already pass `tenant_id: null` for platform scope, and the platform-admin RLS policies already cover insert/update/select/delete for NULL-tenant rows.

After approval, re-click **Connect Microsoft 365** in Platform → Settings → Email.