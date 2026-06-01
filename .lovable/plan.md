## What happened

Nothing in the recent trial/onboarding work touched the marketing site. `/pricing` and `/try` were **never registered as routes** in `src/App.tsx` — previously they fell into a blank "no route matched" state, now they hit the new `*` → `NotFound` catch-all, so the breakage is now visible.

## Audit of every link on the marketing site

From `src/pages/MarketingLanding.tsx`:

| Link | Route registered? | Page file exists? |
|---|---|---|
| `/auth` | yes | yes |
| `/auth?mode=register` | yes (same route) | yes |
| `/contact` | yes | yes |
| `/privacy` | yes | yes |
| `/terms` | yes | yes |
| `/pricing` | **NO** | yes (`src/pages/Pricing.tsx`) |
| `/try` | **NO** | yes (`src/pages/Try.tsx`) |
| `#features`, `#how-it-works` | n/a (in-page anchors) | n/a |
| `/#features`, `/#how-it-works` (footer) | resolves to `/` then scrolls | works |
| `mailto:hello@document-centre.com` | n/a | n/a |

## Fix

In `src/App.tsx`:

1. Import `Pricing` from `@/pages/Pricing` and `Try` from `@/pages/Try`.
2. Add two routes alongside the existing public ones (next to `/contact`):
   ```tsx
   <Route path="/pricing" element={<Pricing />} />
   <Route path="/try" element={<Try />} />
   ```

No other changes. Marketing page itself, brand tokens, and footer links remain untouched.

## Verification

- Visit `/pricing` → renders the Pricing page.
- Visit `/try` → renders the Try page.
- Click every header/footer link on the landing page — none should 404.
