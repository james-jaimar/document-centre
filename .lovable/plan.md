

## Regional pricing: IP-based detection, platform admin management, and visitor override

### Overview

Add a multi-region pricing system for the public `/pricing` page. Visitors see prices in their local currency (detected from IP), can manually switch region, and you (platform admin) can manage all pricing from a new admin page.

### Architecture

```text
  Visitor hits /pricing
       │
       ▼
  React hook: useRegionalPricing()
       │
       ├─ Check localStorage for manual override
       │
       ├─ If none: call free IP geolocation API (ip-api.com or similar)
       │   └─ Map country code → region (US/UK/EU/AU/ZA)
       │
       ├─ Fetch pricing matrix from Supabase table
       │
       └─ Return { region, currency, symbol, plans[], setRegion() }
```

### Database

**New table: `platform_pricing_regions`** (no RLS needed — public read, platform admin write)

| Column | Type | Example |
|---|---|---|
| `id` | uuid PK | |
| `region_code` | text UNIQUE | `US`, `UK`, `EU`, `AU`, `ZA` |
| `region_label` | text | `United States`, `United Kingdom`, etc. |
| `currency_code` | text | `USD`, `GBP`, `EUR`, `AUD`, `ZAR` |
| `currency_symbol` | text | `$`, `£`, `€`, `A$`, `R` |
| `country_codes` | text[] | `{US}`, `{GB}`, `{DE,FR,IT,ES,NL,BE,...}` |
| `tax_note` | text nullable | `excl. VAT` or `excl. GST` |
| `is_default` | boolean | true for one row (fallback) |
| `sort_order` | int | display order in selector |

**New table: `platform_pricing_plans`**

| Column | Type | Example |
|---|---|---|
| `id` | uuid PK | |
| `region_id` | uuid FK → platform_pricing_regions | |
| `plan_slug` | text | `starter`, `core`, `multi_branch` |
| `plan_name` | text | `Starter` |
| `price` | numeric(10,2) | `149.00` |
| `sort_order` | int | 1, 2, 3 |
| UNIQUE | `(region_id, plan_slug)` | |

**RLS policies:**
- Both tables: `SELECT` open to `anon` (public page needs to read)
- `INSERT/UPDATE/DELETE` restricted to `platform_admin` role via `has_role(auth.uid(), 'platform_admin')`

**Seed data** (migration INSERT):
- 5 regions: US, UK, EU, AU, ZA with their country code arrays
- 15 plan rows (3 plans x 5 regions) with the prices you specified:
  - Starter: $149 / £119 / €129 / A$219 / R1,799
  - Core: $199 / £149 / €169 / A$279 / R2,499
  - Multi-Branch: $349 / £259 / €299 / A$479 / R4,499

### New files

#### 1. `src/hooks/useRegionalPricing.ts`
- On mount: check `localStorage.getItem('dc_region_override')`
- If no override: fetch visitor country from a free IP API (e.g. `https://ip-api.com/json/?fields=countryCode` or `https://ipapi.co/json/`)
- Map the 2-letter country code to a region by checking `country_codes` arrays from `platform_pricing_regions`
- If no match, fall back to the row where `is_default = true`
- Fetch `platform_pricing_plans` joined with the matched region
- Expose: `region`, `plans`, `regions` (for selector), `setRegion(code)` (writes to localStorage and updates state)
- Cache region detection result in `sessionStorage` to avoid repeat IP calls

#### 2. `src/pages/platform/PlatformPricingRegions.tsx`
Platform admin page at `/platform/pricing` with:
- Table of regions (code, label, currency, country codes, tax note, default flag)
- Inline edit or dialog to add/edit/delete regions
- Below or as a tab: per-region plan prices in an editable grid
- Simple CRUD using Supabase client directly (platform admin is authenticated)

### Modified files

#### 3. `src/pages/Pricing.tsx`
- Import and call `useRegionalPricing()`
- Replace hardcoded `plans` array with data from the hook
- Replace hardcoded `£` with `region.currency_symbol`
- Add a compact region selector (dropdown or pill group) near the hero or above the pricing cards — shows flag emoji + currency code, e.g. "🇬🇧 GBP"
- Show `tax_note` beneath prices when present (e.g. "excl. VAT")
- Keep all feature lists, comparison table, FAQs, and layout unchanged — only the prices and currency symbol change
- While loading, show skeleton placeholders for prices

#### 4. `src/App.tsx`
- Add route `/platform/pricing` → `PlatformPricingRegions` (platform_admin only)

#### 5. `src/components/AppSidebar.tsx`
- Add "Pricing Regions" nav item under Platform section, linking to `/platform/pricing`

### Region selector UX

A small, elegant selector positioned just above the pricing cards or in the hero section:
- Row of pill buttons showing: 🇺🇸 USD · 🇬🇧 GBP · 🇪🇺 EUR · 🇦🇺 AUD · 🇿🇦 ZAR
- Active region is highlighted
- Clicking sets localStorage override and updates prices instantly
- Auto-detected region has a subtle "(detected)" label on first load

### IP detection approach

Use a free, no-key-required API called client-side (no edge function needed):
- Primary: `https://ip-api.com/json/?fields=countryCode` (free for non-commercial, 45 req/min)
- The call is made once per session and cached in `sessionStorage`
- If the call fails or is blocked, fall back to the default region (UK, since the page was last set to GBP)

### Files to create/change

| File | Change |
|---|---|
| **Migration SQL** | Create `platform_pricing_regions` and `platform_pricing_plans` tables with RLS + seed data |
| `src/hooks/useRegionalPricing.ts` | New hook: IP detection, region matching, plan fetching, manual override |
| `src/pages/platform/PlatformPricingRegions.tsx` | New platform admin page for managing regions and plan prices |
| `src/pages/Pricing.tsx` | Replace hardcoded prices with hook data; add region selector UI |
| `src/App.tsx` | Add `/platform/pricing` route |
| `src/components/AppSidebar.tsx` | Add nav item for Pricing Regions under Platform section |

