# Spec-quote engine — parity with the customer configurator

Right now `QuoteSpecBuilder` only exposes quantity, page count, colour and duplex, plus a flat list of top-level product options. For anything richer than flyers (bound documents, ring binders, presentations, brochures, business cards, photo prints, booklets) it can't produce a realistic price and it doesn't seed the sections/covers/paper/binding choices the customer would see. Customer email is also a raw text box with no lookup.

This plan rebuilds the builder so that:
1. Admin/branch sees the **same configurator UI the customer sees**, per product family.
2. What they save is a **complete spec** (including multi-section layout) that repopulates the customer's build flow when they accept and upload artwork.
3. Customer email autocompletes against existing branch/tenant customers.

## What we'll change

### 1. Customer picker (both admin + branch)
- Replace the raw email `Input` with a combobox backed by `useBranchCustomers` (branch context) or `useTenantCustomers` (admin context).
- Typing filters existing customers by email/name; selecting one fills email, name, and `customer_profile_id`.
- Free-text still allowed for brand-new customers — falls back to today's `profiles` lookup on save.

### 2. Product configurator parity
Reuse the exact components the customer sees so behaviour stays in lockstep:
- **Single-section families** (flyers, posters, business cards, photo prints, booklets, brochures, loose sheets): mount the real `<OptionsPanel />` with the same props `OrderBuild` passes it — `packBlocks`, `blocksActive`, `allowedSides`, `lockedDisplay`, `familySlug`. This gives pack-price ladders for flyers, BC matrix for business cards, brochure fold options, etc.
- **Multi-section families** (bound-documents, presentations, ring-binders): add a lightweight "sections" editor that lets the admin add cover / body / tabs / inserts rows, each with page count, print colour, print sides, and its own paper/finishing options — mirroring the section-controlled options rule already in `OptionsPanel`. Binding, cover stock, and other family-level options come from `<OptionsPanel />` above the sections list.

Live pricing continues via `calculateItemPrice`, but the `ItemSpec` we feed it now includes `sections: [{ role, page_count, is_color, is_duplex, options }]` for multi-section families, matching the shape `OrderBuild` produces.

### 3. Persisting the spec so it round-trips into the cart
On save (unchanged storage model — holding order + `quote_items.configuration`):
- Store the full spec (including sections) in `order_items.spec` and `quote_items.configuration`.
- Flag the holding `order_items` row as `awaiting_artwork` (new `build_status`) so it's visible/editable but not submittable.
- When the customer accepts via `useReactivateQuote`, the cloned cart item already carries the spec — `OrderBuild` reads it, pre-selects every option and section, and only prompts for the missing artwork upload per section.

### 4. UI polish
- Group the builder into: **Customer → Quote details → Product → Configurator (via OptionsPanel) → Sections (multi-section only) → Price summary**.
- Show a compact live breakdown panel on the right on wide screens (sticky), like the customer sees.
- Uppercase specialty size labels (e.g. `DL`) already handled by `OptionsPanel` — inherited for free.

## Technical notes

- Files touched:
  - `src/components/quotes/QuoteSpecBuilder.tsx` — rewrite around real `OptionsPanel` + new `<QuoteSectionsEditor />`.
  - `src/components/quotes/QuoteCustomerPicker.tsx` — new combobox using `useBranchCustomers` / `useTenantCustomers`, prop-selected by `context`.
  - `src/components/quotes/QuoteSectionsEditor.tsx` — new; multi-section rows with per-section options.
  - `src/pages/admin/AdminQuoteSpecCreate.tsx`, `src/pages/branch/BranchQuoteSpecCreate.tsx` — pass `context="tenant" | "branch"` prop.
- No schema changes required — `quote_items.configuration` and `order_items.spec` are jsonb and already carry arbitrary specs.
- Section-controlled option rule (`SECTION_CONTROLLED_OPTION_NAMES`) already defined in `OptionsPanel.tsx`; we reuse the same set to decide which options render globally vs per-section.
- Pack ladders (`packBlocks`) resolved via the existing `useProductPackPricingOverrides` + `useResolvedCatalogOptions` hooks so branch overrides apply.

## Out of scope (flag for follow-up)
- Multiple line items per quote (still one item per spec quote for now).
- Adjusting delivery / VAT / discounts in the builder — quote total = item total.
- Artwork upload UX inside the quote detail page itself — customer still accepts → cart → upload; a "resume quote" landing that jumps straight to the upload step can come next.
