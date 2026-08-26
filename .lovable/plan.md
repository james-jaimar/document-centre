# Editable artwork products: platform capability and tenant templates

## Confirmed current state

- **A2 Deskapds** is a platform/master product and is currently stored as `kind = custom`, so the tenant Products screen hides its **Artwork** action.
- The present implementation treats `templated_artwork` as a mutually exclusive product kind. That would replace a product's normal configurator rather than add editable artwork to it.
- The template tables already support tenant-owned templates, drafts, publishing, base PDFs, and placeholder definitions.
- The customer artwork builder currently searches for the first family with `kind = templated_artwork`; it is not safely tied to the product the customer selected.

## 1. Add an app-level editable-artwork capability

- Add a dedicated boolean capability to master product families, separate from `kind` (for example, `supports_editable_artwork`, default `false`).
- Add an **Editable artwork product** switch to the platform product create/edit flow.
- Keep the existing product kind, product options, catalogue links, pricing engine, and quantity rules intact. A2 Deskpads can therefore remain a normal configured product while also supporting customer-editable templates.
- Present the setting clearly in the platform product list/detail so platform admins can see which products support tenant templates.
- Remove the misleading platform-level template editor from the product accordion; platform defines the capability and product configurator, while tenants own the actual customer templates.

## 2. Give tenants an obvious template-management workflow

- On the tenant **Products** page, show a clear **Templates** action for every product whose editable-artwork capability is enabled, independent of its `kind` or slug.
- Open a dedicated, usable template-management view rather than hiding the workflow behind product-type inference.
- Reuse and improve the existing editor so a tenant can:
  - create and name multiple templates for the selected product;
  - upload or replace the multi-page base PDF;
  - define image and text placeholder boxes;
  - save drafts, publish/unpublish, reorder where supported, and delete templates;
  - see which templates are customer-visible.
- Always create these records with the active `tenant_id` and tenant scope; prevent accidental master-scope creation from the tenant screen.
- Add clear empty, loading, validation, upload, and save states so it is obvious how to create the first template.

## 3. Route customers by selected product, not by a global template kind

- When a customer chooses an editable product, route to the artwork builder with that product family's ID.
- Update new-order and existing-order routes so the builder resolves the exact selected/order-item family rather than querying the first templated product.
- Load only published templates belonging to that product and available to the current storefront tenant.
- If no tenant template is published, show a proper unavailable/empty state instead of silently loading another product's template.
- Preserve the selected product's normal product configuration and pricing inputs alongside the template workflow, so enabling editable artwork does not discard app-level configurator rules.

## 4. Tighten template visibility and ownership

- Update database policies so placeholder rows inherit the same tenant and publication visibility as their parent template; unpublished or other-tenant placeholder definitions must not be anonymously readable.
- Keep template writes restricted to authorised tenant owners/admins and platform administrators acting within a tenant context.
- Ensure customer reads expose only active, published templates for the current storefront tenant and selected product.
- Add the required grants in the same migration as any schema change.

## 5. Verification

- Enable editable artwork for **A2 Deskapds** at platform level without changing its current `custom` kind.
- Verify the tenant Products screen immediately exposes **Templates** for that product.
- As the tenant, create a draft template, upload its PDF, add placeholders, publish it, and confirm it appears only in that tenant's storefront.
- Confirm another tenant cannot read or edit the template or its placeholder definitions.
- Select A2 Deskpads as a customer and verify the exact product's templates, configurator settings, pricing, saved order spec, cart flow, and existing-order resume path all remain linked to A2 Deskpads.

## Technical details

- Schema: add a non-null boolean with a safe `false` default to `public.product_families`; retain the existing `kind` column for physical/configurator behaviour.
- Frontend: update the product-family form/wizard, platform products list, tenant product catalogue, new-order routing, order resume routing, and templated artwork builder.
- Data hooks: make template queries explicitly product- and tenant-aware rather than relying only on RLS or `kind`.
- Existing `artwork_templates` and `artwork_template_placeholders` remain the source of truth; no duplicate template model is needed.
