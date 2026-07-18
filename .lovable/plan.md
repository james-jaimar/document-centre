## Inject dummy A4 size into spec-quote builder

The customer configurator only unlocks options once a document has been uploaded and the PDF engine reports a page size. The spec-quote builder has no artwork, so `OptionsPanel` sits with everything greyed out ("Not selected") and the size dropdown never populates.

Fix: seed a synthetic "uploaded document" context of **A4 portrait, 1 page** whenever a quote spec is being built, exactly as if the PDF engine had just read that from a real upload. The admin/branch can then change the size (and any other option) from the configurator like a customer would.

### Changes

1. **`src/components/quotes/QuoteSpecBuilder.tsx`**
   - Build a `syntheticDoc` object: `{ widthMm: 210, heightMm: 297, pageCount: spec.pageCount ?? 1, orientation: "portrait", sizeLabel: "A4" }`.
   - Pass it into `OptionsPanel` via the same props the customer flow uses (detected size / page count / orientation), so:
     - Document Size defaults to A4 but is user-changeable.
     - Paper Stock, Covers, Lamination, Print Colour, Sides, Stapling etc. all become selectable.
     - Blocks-mode products (Flyers) resolve their pack ladder against A4 by default.
   - Persist the currently selected size (not the dummy) into `spec` so pricing and later artwork-upload match.

2. **`src/pages/dashboard/QuoteArtworkUpload` flow (existing)** — no code change, but note in the plan: when the customer later uploads real artwork against this quote, the real detected size supersedes the A4 seed. If it differs from the quoted size, the existing repricing path already handles it (per the admin-quote-mode memory).

3. **`QuoteSectionsEditor.tsx`** — same seed applied to each section's default size so Bound Documents / Presentations / Ring Binders sections start on A4 instead of blank.

### Out of scope

- No schema changes. The A4 seed lives only in the builder's local state; the saved `spec` stores whatever size the admin actually picked.
- No changes to the customer-side configurator or pricing engine.
