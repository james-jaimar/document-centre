

# Sweep findings + plan

I checked the CRM, the order detail spec rendering, and the cart→order handoff. Three concrete gaps vs Shopify-grade:

## Gap 1 — No way to create a customer from the Customers page

The "+ Add customer" button is missing on `/admin/customers`. The capability exists (the existing `AddMemberDialog` already supports `role: customer`), but it's only reachable from `/admin/users`, which is the wrong surface (Users = staff; Customers = customers).

**Fix:** Reuse `AddMemberDialog` on the Customers page, pre-locked to `role: customer` (no role selector shown). Lookup-by-email → if the profile exists, attach as customer; if not, send an invite email via the existing `invite-member` edge function. After save, the new customer appears in the list (orders=0, spent=R0).

## Gap 2 — Order specs are not captured into the snapshot

Right now in `src/hooks/useCart.ts` `placeOrder`, jobs are built like this:

```ts
configuration: item.spec || {},   // raw {selected_options: {...}, page_count, ...}
product_snapshot: { product_family_id, product_name }
```

So the JobDetailPanel sees no `summary` and no `sections` and renders only product name + qty. **Size, binding, covers, paper, lamination, hole-punch, etc. are stored as slugs only — never resolved to labels and never grouped for display.** Per-section paper/colour/duplex/lamination from `document_sections` is never copied either.

**Fix:** Build a proper snapshot at place-order time. New helper `src/lib/orders/buildJobSnapshot.ts`:

```text
buildJobSnapshot({ item, productOptions, sections, documents }) → {
  configuration: {
    summary: {
      primary_spec_1: "Size"        → "A4 (210×297mm)"
      primary_spec_2: "Binding"     → "Wire bound"
      primary_spec_3: "Pages"       → "120"
    },
    sections: [
      { title: "Document",       items: [Pages, Quantity, Orientation] },
      { title: "Size & Format",  items: [Document Size, Page Count] },
      { title: "Binding",        items: [Binding type, Hole Punch, Spine] },
      { title: "Covers",         items: [Front Cover, Back Cover, Lamination] },
      { title: "Paper & Print",  items: [Body Paper, Body Weight, Colour, Sides] },
      { title: "Finishing",      items: [Bleed, Lamination, Tabs, Inserts] },
      { title: "Files",          items: [filename · pages · size]* }
    ]
  },
  product_snapshot: {                              // immutable record
    product_family: { id, slug, name },
    selected_options: [                           // resolved labels, not just slugs
      { name: "Binding", slug: "wire", label: "Wire Bound", group: "Binding", price_impact, metadata }
    ],
    sections: [                                   // per-section detail from document_sections
      { label, section_type, page_range_start, page_range_end, paper_stock, paper_weight_gsm,
        is_color, is_duplex, lamination, color }
    ],
    documents: [{ file_name, page_count, file_size, page_width_mm, page_height_mm }]
  }
}
```

Resolution uses `productOptions[].values` (already structured JSONB with labels/groups). Group-into-section uses the existing `group` field on `StructuredOptionValue`. `useCart.placeOrder` will fetch options + sections + documents for each cart item and call `buildJobSnapshot` instead of passing `item.spec` raw.

Result: JobDetailPanel and `OrderDeliveryTab`/customer order detail all light up with the full spec automatically (they already render `configuration.sections`).

## Gap 3 — Customer area shell is sparse

`/t/:slug/account` exists but has no entry visible until a customer signs in. Two small things while we're here:

1. Sidebar under Customer portal already has "My Account" — good.
2. Add a **read-only "Account info"** card to the admin Customer detail (`AdminCustomerDetail`) with: created date, last sign-in (from `auth.users` via a SECURITY DEFINER helper), default delivery address, total orders, lifetime value. The first three fields are the only new ones — values exist; just need surfacing.

---

## Files

**New**
- `src/lib/orders/buildJobSnapshot.ts` — pure function, fully unit-testable
- `src/components/admin/AddCustomerDialog.tsx` — thin wrapper around invite flow, role hard-coded to `customer`

**Edit**
- `src/hooks/useCart.ts` — `placeOrder` fetches options+sections+documents per item and uses `buildJobSnapshot`
- `src/pages/admin/AdminCustomers.tsx` — add "+ Add customer" button → `AddCustomerDialog`
- `src/pages/admin/AdminCustomerDetail.tsx` — add Account info card on Overview/top
- (no DB migration needed — `customer_notes` and backfill are already done)

## Verification

1. `/admin/customers` shows "+ Add customer" → enter `test@example.com` → invite sent → row appears immediately with 0 orders.
2. Place an order from a customer account → open `/admin/orders/<id>` → JobDetailPanel now shows all sections: Size, Binding, Covers, Paper, Finishing, Files — with resolved labels (e.g. "A4 (210×297mm)" not "a4").
3. Customer detail page shows account-info card with last sign-in and default delivery address.

