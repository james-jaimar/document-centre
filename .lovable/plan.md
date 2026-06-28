## Goal

Give Platform Admin a CMS to edit the 7 platform-wide legal documents (DPA, Billing & Cancellation, Acceptable Use, Service Level, Sub-processors, Security & Backups, Cookies). Tenant-level Terms & Privacy stay where they are (already editable per-tenant).

The current hardcoded React pages under `src/pages/legal/*` become the **initial seed**. Once seeded, the database is the source of truth and the public legal pages render stored HTML.

## What gets built

### 1. Database

New table `platform_legal_documents`:
- `slug` (PK-ish: `dpa`, `billing`, `aup`, `sla`, `subprocessors`, `security`, `cookies`)
- `title`
- `published_version` (int) + `published_html` + `published_at`
- `draft_html` + `draft_updated_at` + `draft_updated_by`
- `effective_date`
- standard `created_at` / `updated_at`

RLS:
- `SELECT` allowed for everyone (anon + authenticated) on the **published** columns only (via a view or policy) — needed so the public `/legal/*` pages can render.
- `INSERT / UPDATE` restricted to platform admins (`has_role(auth.uid(), 'platform_admin')`).

A second table `platform_legal_versions` keeps an immutable history row per publish (slug, version, html, effective_date, published_at, published_by) — used by the Legal Status page to show what each branch accepted.

Grants follow project standard (`anon SELECT` on published view, `authenticated` full, `service_role` all).

### 2. Seeding

On the first read of each slug, if the row is missing, the new Platform Legal page seeds it from the current hardcoded JSX:
- Render each existing `src/pages/legal/*.tsx` component to an HTML string at build time using a small helper, OR
- Ship a one-off seed file `src/lib/legal/seedContent.ts` that contains the HTML transcription of each of the 7 pages (entity tokens kept as `{{legal_name}}`, `{{trading_name}}`, etc. and interpolated at render time).

Seed version is `1`. Effective date pulled from existing `LEGAL_DOCS` entries.

### 3. Platform admin UI

New route `/platform/legal` (added to platform sidebar under existing "Legal Status"):
- Index card list of all 7 documents — shows title, published version, last published date, "Draft pending" badge if `draft_updated_at > published_at`.
- Click → editor page with:
  - Tiptap RichTextEditor (reuse `src/components/admin/RichTextEditor.tsx` — same as Tenant Legal tab).
  - **Save Draft** button → updates `draft_html` only. Public site unchanged.
  - **Preview** button → opens `/legal/<slug>?preview=1` in a new tab rendering the draft (platform-admin-only param).
  - **Publish new version** button → confirmation modal explaining "This will bump to v{N+1}, mark all existing branch acceptances as outdated, and prompt branches to re-accept at next checkout." On confirm: writes a new row in `platform_legal_versions`, copies `draft_html` → `published_html`, increments `published_version`, clears draft.
  - Effective-date input (defaults to today on publish).
  - History panel listing prior versions with timestamps + "View" link.

### 4. Public legal pages

`src/pages/legal/BillingPolicy.tsx`, `DataProcessingAddendum.tsx`, `AcceptableUsePolicy.tsx`, `ServiceLevel.tsx`, `SubProcessors.tsx`, `SecurityStatement.tsx`, `CookiePolicy.tsx` rewritten to:
- Fetch the row from `platform_legal_documents` by slug (cached via React Query).
- Render `published_html` (or `draft_html` when `?preview=1` and user is platform admin) inside the existing `LegalLayout`.
- Interpolate entity tokens (`{{legal_name}}`, `{{trading_name}}`, `{{company_number}}`, `{{jurisdiction}}`) from `src/lib/legal/entity.ts` before rendering.
- Show version + effective date from the DB row (replaces the static `LEGAL_DOCS[slug]` lookup for these 7).

`TermsOfService.tsx` and `PrivacyPolicy.tsx` are **not** touched — they remain tenant-driven via `useLegalDocument`.

### 5. Versioning + re-acceptance

`LEGAL_DOCS` in `src/lib/legal/versions.ts` is no longer the version source for the 7 platform docs — replaced by `published_version` from the DB. The constant stays for `terms` / `privacy` and as the route/title registry.

`PlatformLegalStatus.tsx` already groups by `accepted_version` vs `LEGAL_DOCS[slug].version`. Update it to read the current published version for the 7 platform docs from the DB instead of the constant, so a publish immediately flips affected branches to "Outdated".

Existing `subscription_acceptances` capture logic at checkout already records `accepted_version` per slug — no change needed there beyond reading the current version dynamically.

### 6. Sidebar / nav

Platform sidebar: add **Legal Documents** entry above the existing **Legal Status** entry.

## Out of scope (confirm if you want any of these)

- Editing tenant-level Terms & Privacy (already done in `LegalTab.tsx`).
- Editing the entity constants (`src/lib/legal/entity.ts`) from the UI — still code-only.
- Emailing branches when a new version publishes — re-acceptance happens at next checkout banner only.
- Diff view between versions.

## Files touched

- New: `supabase/migrations/*` (two tables + RLS + grants), `src/pages/platform/PlatformLegalDocuments.tsx` (index), `src/pages/platform/PlatformLegalEditor.tsx` (editor), `src/hooks/usePlatformLegalDocuments.ts`, `src/lib/legal/seedContent.ts`, `src/lib/legal/renderLegalHtml.ts` (token interpolation).
- Edited: 7 files under `src/pages/legal/` (DPA, Billing, AUP, SLA, Sub-processors, Security, Cookies) — swap hardcoded JSX for DB-driven render, keep `LegalLayout`. `src/pages/platform/PlatformLegalStatus.tsx` to read DB versions. Platform sidebar/router for the new route.
