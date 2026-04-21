

## Goal

Wire up `documentcentre.com` so a visitor can hit one button, drop straight into a fully working **My Print Centre** (was "Dashboard"), upload, configure and "checkout" a real-looking print order — with no signup. All of that activity flows into a dedicated **Demo** tenant that you, as Platform Admin, can monitor from a single backend view.

This plan covers four pieces:

1. Wire up the marketing CTAs (`Try it free` / `Start Free Trial`)
2. Build the one-click anonymous demo flow into a dedicated **Demo** tenant
3. Rename customer “Dashboard” → **My Print Centre**
4. Give Platform Admin a **Demo Activity** view to watch live

---

## 1. Marketing landing → Try it now

Today the hero CTAs jump to `/auth` or scroll to `#cta`. We change them to the demo flow:

- Primary CTA in hero: **“Try it now — no signup”** → `/try`
- Secondary CTA: **“Start Free Trial”** → `/auth?mode=register` (kept for the lead-gen path)
- Footer/secondary CTAs that currently point at `#cta` get the same split: a green “Try it now” + a lighter “Start Free Trial”.

We keep the existing pricing section. I’ll wire the **Pricing → CTA buttons** to the same `/try` route so visitors can go from “see the price” → “play with it” in one click.

`/try` is a thin React page that:
- Calls Supabase `auth.signInAnonymously()`
- Calls a new edge function `demo-bootstrap` that joins the new user to the **Demo** tenant as a `customer` membership (and tags the profile as a demo user)
- Redirects to `/t/demo/print-centre`

---

## 2. The Demo tenant + isolation model

We create one dedicated tenant (slug `demo`) that ALL anonymous demo visitors share. This is simple, easy to wipe, and gives you one place to watch activity.

**One-time DB setup (migration):**
- Insert a tenant `slug = 'demo'`, `name = 'Document Centre Demo'`, with onboarding marked complete.
- Seed it with one branch, the standard product families, and a basic pricing rule set (clone of an existing template tenant — likely PostNet — minus their identity).
- Add a `is_demo boolean` column to:
  - `profiles` (so we can identify demo users)
  - `orders` (so we can hide demo orders from real tenant reporting + show them in the platform admin view)
  - `tenants` (one row, `demo`, marked true)
- Add an RLS-safe security definer helper `is_demo_tenant(tenant_id)`.

**Demo user identity:**
- Anonymous user is created via Supabase `auth.signInAnonymously()`.
- `handle_new_user` trigger is extended: if the signup metadata contains `is_demo: true`, set `profiles.is_demo = true`.
- `demo-bootstrap` edge function inserts a `tenant_memberships` row for that user into the Demo tenant as `customer`, then returns `{ slug: 'demo' }`.

**Lifecycle / cleanup:**
- New scheduled edge function `cleanup-demo-data` (daily): deletes anonymous demo users and their orders older than 7 days. Keeps the Demo tenant itself, its branch, products, pricing intact.
- Storage objects uploaded by demo users go into the existing `documents` bucket but are scoped under `demo/<user_id>/...` for easy deletion.

---

## 3. Real flow, never fulfilled

The demo storefront is the existing customer portal — same upload, preflight, preview, configurator, cart, checkout — pointed at the Demo tenant. The only changes:

- **Checkout submission** (`useCart.placeOrder` + `order-engine`): if the order’s tenant is the Demo tenant, set `orders.is_demo = true` and force `admin_status = 'demo'` (new state). The order still goes through `submitted → confirmed` so the customer sees the full confirmation page, invoice screen, and order-detail UI.
- **Demo orders never trigger production-side automation**: `email-dispatcher`, `send-order-email`, `generate-invoice-pdf` short-circuit when `is_demo = true` (no real emails, no PDFs sent anywhere).
- **Subtle “DEMO” watermark/badge**: a slim banner on the customer portal when the user’s profile is `is_demo`, plus a “DEMO” chip on every order row in their list. This sells the point without breaking the experience.
- **Conversion CTA**: a persistent “Save my work — create a free trial account” button in the demo banner. Clicking it takes them to `/auth?mode=register&from=demo` where, on signup, the existing `handle_new_user` trigger is extended to migrate the anonymous user’s orders/documents over to the new identity (link the new auth user to the same profile row instead of creating a new one — Supabase supports converting anonymous → permanent via `updateUser({ email, password })`, no migration of rows needed).

---

## 4. Rename Dashboard → My Print Centre

Customer portal only. This is a label/route change, not a functional one.

- Sidebar item label: `Home` → keep `Home` (unchanged) but the page itself is rebranded.
- Page title in `CustomerDashboard.tsx`: `Welcome back` headline area → “**My Print Centre**”.
- Browser title: “My Print Centre — {Tenant Name}”.
- Route: keep `/t/:slug/dashboard` working as a redirect for back-compat, but introduce `/t/:slug/print-centre` as the canonical URL. All internal `navigate()` / `<Link>` references updated. `AppEntryRedirect` updated. `CustomerSidebar` updated. `StorefrontRedirect` updated.
- Marketing hero copy referencing “dashboard” updated to “your Print Centre”.

(Admin / Branch / Platform “dashboards” are not touched — they’re different surfaces.)

---

## 5. Platform Admin → Demo Activity view

A new page at `/platform/demo` (linked from the Platform sidebar):

- **Top stats**: anonymous demo users in the last 24h / 7d, demo orders submitted, most-configured product family.
- **Live orders table**: every `orders.is_demo = true` row, newest first, with: time, anon user id (short), product family, page count, qty, total, configurator path taken.
- **Click-through**: opens the existing `AdminOrderDetail` page for the demo tenant (uses the existing platform-admin override RLS we already fixed today).
- **One-button “Wipe demo data now”**: calls `cleanup-demo-data` with `force=true`.

This is your sales tool — “look, here’s a real prospect playing with the product right now.”

---

## Technical changes summary

### Database
- New tenant row + branch + product families + pricing rules for `demo` (seed migration).
- `profiles.is_demo`, `orders.is_demo`, `tenants.is_demo` columns.
- RLS: extend `user_can_read_order` / `user_is_staff_for` (no change needed — platform admin already covers it). Add policies so demo customers (anonymous users) can only see their own demo orders inside the demo tenant.
- Extend `handle_new_user` to honour `is_demo` metadata.
- New `order_status` value `'demo'` is NOT added — we use `is_demo` flag on the existing lifecycle so the customer sees the real confirmed flow.

### Edge functions
- New: `demo-bootstrap` — joins anon user to demo tenant, returns slug.
- New: `cleanup-demo-data` — scheduled daily; manual trigger from platform admin.
- Modified: `email-dispatcher`, `send-order-email`, `generate-invoice-pdf`, `order-engine` — short-circuit on `is_demo`.

### Frontend
- New: `src/pages/Try.tsx` — the `/try` entry point.
- New: `src/pages/platform/PlatformDemoActivity.tsx`.
- Modified: `MarketingLanding.tsx` — wire CTAs.
- Modified: `CustomerLayout.tsx` — demo banner + “Save my work” CTA when `profile.is_demo`.
- Modified: `CustomerDashboard.tsx` — rebrand to **My Print Centre**.
- Modified: `CustomerSidebar.tsx` — point at `/print-centre`.
- Modified: `App.tsx` — add `/try`, `/t/:slug/print-centre`, `/platform/demo` routes; legacy `/dashboard` keeps redirecting.
- Modified: `useAuth.tsx` / `AppEntryRedirect.tsx` — anonymous demo users always land in the demo storefront.
- Modified: `Auth.tsx` register flow — when `?from=demo`, calls `updateUser` to upgrade the anonymous user to a permanent account instead of creating a new one (preserves their orders).

### Supabase config
- Enable “Allow anonymous sign-ins” in Auth settings (you’ll need to flip this on in the Supabase dashboard — I’ll flag it).

---

## Verification

1. Open `documentcentre.com` (incognito) → click **Try it now** → land in **My Print Centre** at `/t/demo/print-centre` with no login screen, with a “DEMO MODE” banner.
2. Upload a PDF → preflight runs → preview renders → configure → add to cart → checkout → see the confirmation page with a full (demo) invoice number.
3. No real email is sent.
4. Sign in as Platform Admin → `/platform/demo` → see the order I just placed within seconds, click through to its full order detail.
5. Click “Save my work” in the demo banner → register with email/password → land back in `/t/demo/print-centre` as a real account → previous demo order is still there under my new identity.
6. Run cleanup → demo orders older than 7 days disappear; the Demo tenant + products remain intact.
7. Real tenants (PostNet, etc.) — their order lists are unaffected; their dashboards do not show any demo data.

---

## Out of scope (deliberately)

- Per-visitor ephemeral tenants (rejected — too much overhead).
- Real payment gateway in demo (never charge).
- Renaming Admin / Branch / Platform “dashboards” (only the customer-facing one is renamed).
- Marketing copy rewrite beyond the CTAs and the dashboard rename references.
- A separate “sandbox” code path with mocked data (we deliberately keep the flow real so the demo sells the product honestly).

