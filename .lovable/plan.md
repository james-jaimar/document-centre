# Ingest Jetline branches

Jetline tenant already exists (`ee502eb0-fc87-4659-a09e-12dd230178fc`, app `document-centre`) and has zero branches. The spreadsheet lists 44 stores.

## What gets created

One row in `public.branches` per store, with:

| Column | Source |
| --- | --- |
| `tenant_id` | Jetline tenant id (fixed) |
| `name` | `store_name` with the "Jetline " prefix stripped (e.g. "Bryanston", "Wits University") |
| `slug` | last segment of `store_url` (e.g. `jetline-bryanston`) — unique per tenant |
| `url_slug` | same as `slug` (used in `/t/jetline/:branchSlug`) |
| `address` | full `address` field verbatim |
| `province` | mapped from `province_slug` → "Gauteng", "Western Cape", "KwaZulu-Natal", "North West", "Limpopo", etc. |
| `city` | best-effort parse from the tail of `address` (e.g. "Johannesburg", "Cape Town", "Pretoria"); left NULL when ambiguous |
| `country` | `ZA` (default) |
| `phone` | `phone` verbatim |
| `email` | `email` verbatim (lowercased) |
| `trading_name` | `store_name` (full "Jetline …") |
| `is_active` | `true` |
| `is_live` | `false` — matches the pattern used for PostNet / 3at1: branches only go live when they start a trial or activate a paid subscription |

No `tenant_membership` accounts, no activation emails, no subscriptions are created here — activation is a separate step (handled by the existing `provision-branch-admins` + `send-branch-activation` flow you already use).

## How

A single `INSERT` via the data tool with all 44 rows built from the spreadsheet. Idempotent guard: `ON CONFLICT (tenant_id, slug) DO NOTHING` so re-running is safe.

## Out of scope (confirm if you want these too)

- Provisioning branch-manager users from the `email` column (would run `provision-branch-admins` afterwards).
- Sending activation emails.
- Seeding pricing — the `trg_clone_pricing_for_new_branch` trigger already handles this automatically on insert.

Say the word and I'll insert the 44 rows.
