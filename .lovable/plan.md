# Business-first copy for The 2027 Edition storefront

Make The 2027 Edition storefront clearly read as a business-to-business print service, and surface the 10-unit minimum order everywhere a customer looks.

## What changes

Update the existing storefront config for tenant **The 2027 Edition** (`slug: the-2027-edition`) with copy that:

- Positions the site as **for businesses, resellers and trade buyers**, not consumers.
- States the **minimum order is 10 units** on the homepage, shop page, product page, and trade band.
- Keeps the current visual style and section order intact.

### Specific copy updates

1. **Hero** — keep the bold "SIZE REALLY DOES MATTER" headline, but rewrite the eyebrow, subcopy and spec items to call out business use and the 10-unit minimum.
2. **Assurance bar** — replace one item with a "Minimum order 10 units" message and reword others for business buyers.
3. **Shop page** — update heading/subcopy to mention trade/business ordering and the 10-unit minimum.
4. **Trade band** — strengthen the heading/body to say this is a trade/business service, repeat the minimum order, and change the CTA to "Open a trade account".
5. **How it works** — tweak step copy to reflect business ordering (quantities, repeat orders, invoicing).
6. **Product-page defaults** — update the three information sections (`Specifications`, `Artwork requirements`, `Turnaround & delivery`) so every product shows the 10-unit minimum and business context by default, unless the tenant has already overridden a section.
7. **Footer strip** — add a "Minimum order 10 units" item.

### Implementation

- Read the current `tenant_settings` row for `category = 'storefront'`, `setting_key = 'config'` for The 2027 Edition.
- Merge the new copy into the existing JSON, preserving images, feature cards, section order and page toggles.
- Upsert the updated config back to `tenant_settings`.
- For product-page defaults, check whether a `product_copy` row exists; if not, create one with business/10-unit wording for the three default sections.
- Verify the live storefront renders the new copy.

## Out of scope

- No new components, no new database columns, no code changes.
- No changes to other tenants.
- No changes to pricing or minimum-order enforcement (this is copy only).
