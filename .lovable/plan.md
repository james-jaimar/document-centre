## Diagnosis

"Failed to send a request to the Edge Function" with **zero invocation logs** on `demo-gate-set-password` means the function isn't booting — the request never reaches our handler. The root cause is the `https://deno.land/x/bcrypt@v0.4.1/mod.ts` import: it uses Node-style sync APIs that frequently fail to cold-start in Supabase's Deno edge runtime (and it's been deprecated in favor of Web Crypto). Both `demo-gate-set-password` and `demo-gate-unlock` import it, so unlock would fail the same way once a password existed.

The "enabled before password was set" state is harmless — the DB row just has `enabled=true, password_hash=null`. The guard treats that as "not configured" and the admin UI already warns about it.

## Fix

Replace bcrypt with **PBKDF2 via Web Crypto** (`crypto.subtle`), which is built into the Deno runtime — no remote import, no cold-start risk.

### Changes

1. **`supabase/functions/demo-gate-set-password/index.ts`**
   - Remove the `bcrypt` import.
   - Add a small `hashPassword(password)` helper: random 16-byte salt + PBKDF2-SHA256 (200k iterations) → store as `pbkdf2$sha256$200000$<saltB64>$<hashB64>`.
   - Store that string in `password_hash` (column is already `text`).

2. **`supabase/functions/demo-gate-unlock/index.ts`**
   - Remove the `bcrypt` import.
   - Add matching `verifyPassword(password, stored)` that parses the stored string, re-derives, and constant-time compares.

3. **No DB migration needed** — `password_hash` is text and no password has been successfully saved yet, so there's no legacy bcrypt hash to migrate.

4. **No `config.toml` change needed** — Lovable auto-deploys edge functions; the functions already exist on the platform, they're just crashing on import.

### Verification

After redeploy: click **Set password** → expect a `200` log entry on `demo-gate-set-password` and the "Password updated" toast. Then toggle the gate on, open `/t/<slug>` in an incognito window, and confirm the unlock screen accepts the password.

### Out of scope

- No UI changes.
- Not touching the "enabled without password" guard — current behavior (warn in admin UI, treat as not-configured in the gate) is correct.
