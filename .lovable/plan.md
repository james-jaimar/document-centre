## Goal

Bring the tenant login screen (`/t/postnet/auth`) up to the same polish as the PostNet portal: replace the generic blue printer icon + flat red gradient with a properly branded, on-brand sign-in experience.

## What's wrong today

Looking at the current screen vs. the portal:
- **Wrong logo**: shows a generic blue printer square instead of the actual PostNet logo (we already fetch `brandedTenant.logo_url` — it just isn't being used prominently).
- **Flat background**: a plain red-to-grey diagonal gradient with no depth, texture, or brand cue.
- **Generic card**: white rounded card with no PostNet personality, no print-shop motif, no supporting copy.
- **Button is raw `#FF0000`** rather than the refined PostNet red used elsewhere in the portal.
- **No visual continuity** with the portal's glassmorphic "Printflow" aesthetic the rest of the tenant surface uses.

## Approach

Treat this as a visual refinement of an existing screen. Keep all auth logic, routes, gating, social login, and copy untouched — only the presentation layer of `src/pages/Auth.tsx` (and any small token additions) changes.

Two-step ritual:

1. **Generate 3 rendered design directions** for the tenant-branded sign-in card, locked to:
   - PostNet red primary, white surface, dark ink text
   - Tenant logo (`brandedTenant.logo_url`) as the hero mark — no fallback printer icon when a tenant logo exists
   - Same card contents (email, password, OR divider, Google button, Sign In, Forgot / Sign up links)
   - Responsive, works at the current 1484-wide viewport and on mobile
   
   The three directions vary in composition/atmosphere only — e.g.
   - **A. Split-screen editorial** — left brand panel with large logo + tagline + subtle print-shop texture, right clean form panel
   - **B. Centred premium card** — single elevated glass card on a rich layered PostNet-red backdrop (radial glow, subtle paper grain), refined typography
   - **C. Full-bleed branded canvas** — immersive red gradient with brand pattern (envelopes/parcels motif), floating frosted card

2. **Ask the user to pick one** via a prototype question, then implement only the chosen direction.

## Scope

In scope:
- `src/pages/Auth.tsx` presentation (layout, background, logo treatment, card chrome, button styling, spacing, typography)
- Small additions to `src/index.css` / tenant branding hookup if needed for tokens or background effects
- Applies to **tenant** auth (`/t/:slug/auth`) — uses existing `brandedTenant` + `branding` already loaded in the page
- Platform `/auth` keeps its current treatment (different audience, different brand)

Out of scope:
- Auth logic, gating effect, role routing, sign-out behaviour
- `AuthCallback`, `AuthVerify`, `ResetPassword` pages
- Tenant branding data model / `useTenantBranding`
- Any backend/Supabase changes

## Next step

On approval I'll capture the current login screen, generate the 3 directions, and come back with a prototype picker.