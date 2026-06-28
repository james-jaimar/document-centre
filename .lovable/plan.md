## Demo Mode Gate (tenant-scoped)

Add a per-tenant "Demo mode" that hides the **entire tenant surface** (storefront, customer portal, branch picker, everything under `/t/:slug/*`) behind a password screen with a legal disclaimer. Platform admins and signed-in tenant staff bypass it.

### Where it's configured
Tenant Settings → **Legal** tab → new "Demo Mode" card with:
- Toggle: **Enable demo gate**
- Field: **Access password** (single shared, stored hashed)
- Field: **Headline** (e.g. "Concept Demo — Not Affiliated")
- Rich-text: **Disclaimer copy** (paste your own copy)
- Field: **Cookie lifetime** (default 30 days)
- Read-only: last 20 successful unlock events (timestamp + IP) for your records

Stored in `tenant_settings` under category `legal`, keys: `demo_gate_enabled`, `demo_gate_password_hash`, `demo_gate_headline`, `demo_gate_disclaimer_html`, `demo_gate_cookie_days`.

### Gate behaviour
- New route guard wraps every `/t/:slug/*` route. On first hit it calls a SECURITY DEFINER RPC `resolve_demo_gate(tenant_id)` that returns `{ enabled, headline, disclaimer_html }` — never the hash.
- If enabled and no valid unlock cookie → render `DemoGatePage` (full-screen, tenant-branded): headline, disclaimer HTML, password input, "I understand this is a concept demo" checkbox, Unlock button.
- Submit posts to edge function `demo-gate-unlock` which: verifies password against the stored hash, logs the attempt, and on success returns a signed JWT cookie `dc_demo_<tenantId>` valid for the configured days.
- Guard checks cookie signature + tenant match on every navigation (cheap, client-side verify of signed token; server re-verifies on sensitive calls).
- **Bypasses**: platform admins (any `is_platform_admin`), any user with a `tenant_memberships` row for that tenant, and the `/admin` + `/platform` routes themselves (never gated).

### Technical bits
- New table `tenant_demo_gate_unlocks` (tenant_id, ip, user_agent, unlocked_at) — append-only, RLS: platform admin + tenant owner/admin read; service role insert. Standard GRANTs.
- Migration: add the 5 settings keys' defaults; no schema change to `tenant_settings` itself.
- New edge functions: `demo-gate-unlock` (verify + issue cookie), `demo-gate-set-password` (hash with bcrypt + save). Password never leaves the server in plaintext after save and is never returned to the client.
- New components: `src/components/legal/DemoGatePage.tsx`, `src/components/legal/DemoGateGuard.tsx`, `src/pages/admin/settings/DemoModeCard.tsx` (mounted inside existing `LegalTab`).
- Hook: `useDemoGate(tenantId)` for the resolved public config + unlock state.
- Route wiring: wrap the existing `/t/:slug/*` route element in `App.tsx` with `<DemoGateGuard>`.

### Out of scope
- Renaming "PostNet Print Center" (you said leave it).
- Per-branch gates, multiple passwords, IP allowlists, email capture — easy to add later if you want.
- Gating `/admin` or `/platform`.

### Files touched
- New: migration, 2 edge functions, `DemoGatePage.tsx`, `DemoGateGuard.tsx`, `DemoModeCard.tsx`, `useDemoGate.ts`.
- Edited: `src/App.tsx` (wrap tenant route), `src/pages/admin/settings/LegalTab.tsx` (mount the new card).

Ready to build on approval — paste your disclaimer copy any time (you can also paste it straight into the Legal tab once the card is live).