

# Bound Document Product System -- Full Architecture Plan

## Analysis of Mimeo's Model

From the screenshots, Mimeo's bound document configurator has **7 option categories**, each with **grouped, hierarchical values**:

```text
BINDING
  ├── Standard: Comb (Black), Spiral (Black/White/Blue/Clear), Twin Loop (Black/Silver)
  └── Ring Binders: Durable D-Ring (0.5" to 4.0"), Black D-Ring (0.5" to 4.0")

COVERS
  ├── No Cover
  ├── Clear Covers: Clear/Matte/Frosted + Black/White/Navy back
  ├── White Card Stock: 80lb Recycled, 80lb Silk, 100lb Bright, 100lb Glossy, 100lb Silk
  └── Synthetic: 6mil/10mil Waterproof Polyester

PRINT TO EDGE
  └── None | Entire Document | Front Cover Only

PAPER STOCK
  ├── White Paper: 24lb Bright, 28lb Premium, 24lb Perforated, 28lb Recycled, 80lb Silk, 100lb Glossy, 100lb Silk
  ├── White Card: 80lb Recycled, 80lb Silk, 100lb Regular, 100lb Glossy, 100lb Silk
  └── Synthetic: 6mil/10mil Waterproof Polyester

LAMINATION
  └── None | Gloss | Matt

PRINT COLOR & PLEX
  ├── Colour: B&W | Colour (can be set per-section)
  └── Plex: Simplex | Duplex (can be set per-section)

INSERTS
  ├── Tabs (with orientation, type, font, auto-insert)
  ├── Slip Sheets
  └── Blanks
```

## The Problem with Our Current Model

Our `product_options.values` is a flat JSONB array of **strings**: `["80gsm Bond", "100gsm Uncoated"]`. This cannot represent:
- **Grouped values** (Clear Covers vs Card Stock Covers)
- **Price impact per choice** (Spiral binding costs more than Comb)
- **Dependencies** (Ring Binder binding disables cover options)
- **Metadata** (max page capacity per binding type)

## The Solution: Structured Option Values

No schema migration needed. We enrich the JSONB `values` array from flat strings to **rich objects**:

```text
Current:  ["Comb (Black)", "Spiral (Black)"]

Proposed: [
  {
    "label": "Comb (Black)",
    "slug": "comb-black",
    "group": "Standard",
    "price_impact": 12.50,
    "price_type": "per_document",     // fixed | per_document | per_page
    "is_default": false,
    "metadata": { "max_sheets": 450, "color": "Black" }
  },
  {
    "label": "Spiral (Black, Small)",
    "slug": "spiral-black-small",
    "group": "Standard",
    "price_impact": 18.00,
    "price_type": "per_document",
    "is_default": true,
    "metadata": { "max_sheets": 310, "color": "Black", "size": "Small" }
  }
]
```

## How Pricing Ties Together

Two layers working in concert:

```text
LAYER 1: pricing_rules table (base rates & volume)
  ├── "B&W per page"     → per_page, R0.45, conditions: { is_color: false }
  ├── "Colour per page"  → per_page, R1.20, conditions: { is_color: true }
  ├── "Duplex discount"  → surcharge, -R0.10, conditions: { is_duplex: true }
  └── "Volume 100+"      → surcharge, -R0.05, conditions: { min_quantity: 100 }

LAYER 2: product_options values (per-selection surcharges)
  ├── Binding: Spiral → +R18.00 per document
  ├── Cover: Matte + Black Back → +R8.50 per document
  ├── Paper: 100lb Glossy → +R0.35 per page
  └── Lamination: Gloss → +R2.00 per page

FINAL PRICE = Σ(pricing_rules applied to spec) + Σ(option value price_impacts)
```

This means the admin sets pricing in two places:
1. **Pricing Rules page** -- base per-page rates, volume discounts, colour surcharges
2. **Product Options editor** -- the price impact of each specific option choice (binding type, cover type, paper upgrade)

## What to Build

### 1. Upgrade ProductOptionsEditor UI

Replace the flat tag-based value entry with a structured value editor:
- Each value is a row with: label, slug (auto-generated), group name, price_impact, price_type dropdown, is_default toggle
- Collapsible metadata section for extra key-value pairs
- Visual grouping preview showing how options will appear to customers
- Reorderable values within groups

### 2. "Seed Bound Document" Admin Action

A button on AdminProducts that auto-creates a complete "Bound Documents" product family with all 7 option categories pre-populated. This creates:

**Product Family:** Bound Documents (`bound-documents`)

**Options auto-created:**

| Option | Type | Values |
|--------|------|--------|
| Binding | select | 8 binding types across 2 groups (Standard + Ring Binders) |
| Cover Stock | select | 14 cover options across 4 groups |
| Paper Stock | select | 12 paper options across 3 groups |
| Print Colour | select | B&W, Colour |
| Print Sides | select | Single Sided, Double Sided |
| Print to Edge | select | None, Entire Document, Front Cover Only |
| Lamination | select | None, Gloss, Matt |

Each value has a sensible default `price_impact` that the admin can adjust.

### 3. Seed Default Pricing Rules

Along with the product family, auto-create starter pricing rules:
- B&W per page base rate (R0.45)
- Colour per page base rate (R1.20)
- Duplex page discount (-R0.10 per page)
- Setup fee (R15.00 per document)

### 4. Update Pricing Engine Type

Add a utility function `calculateItemPrice(spec, options, pricingRules)` that:
1. Evaluates pricing rules matching the spec conditions
2. Adds option value price impacts based on selected options
3. Returns a breakdown object showing each line item

This function will be used later by the document builder and cart.

## File Changes

| File | Action |
|------|--------|
| `src/components/admin/ProductOptionsEditor.tsx` | Major rewrite -- structured value editor with groups, pricing, metadata |
| `src/pages/admin/AdminProducts.tsx` | Add "Seed Bound Document" button |
| `src/lib/seedBoundDocument.ts` | New -- seed data definitions for the full bound document product |
| `src/lib/calculatePrice.ts` | New -- price calculation utility combining rules + option impacts |
| `src/hooks/useProductOptions.ts` | Minor -- add types for structured option values |

## Forward Thinking

This architecture scales cleanly:
- **New product families** (Saddle Stitched, Posters, Loose Sheets) just need their own seed functions with appropriate options
- **Tenant customisation** -- tenants can override option values and pricing for their own branding
- **Branch capabilities** -- `branch_capabilities` table already links product families to branches, so branches can declare which options they support
- **Document builder** -- reads product options to render the left-panel configurator (exactly like Mimeo's UI), with groups becoming accordion sections
- **Per-section overrides** -- the `document_sections` table already has `is_color`, `is_duplex`, `paper_stock` fields, so "Set by Section" works natively
- **Inserts/Tabs** -- the `section_type` enum already includes `tab` and `insert`, so tab management maps directly to document sections

