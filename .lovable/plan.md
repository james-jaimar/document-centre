# Copy artwork templates between tenants and branches

Yes, this is doable. Templates are already self-contained rows plus a base PDF file, so a copy is: duplicate the template row into the destination owner, duplicate its placeholder boxes, and duplicate the base PDF and thumbnail into the new template's own storage folder.

## What I checked

- `artwork_templates` rows carry `scope_type` (`master` / `tenant` / `branch`), `tenant_id`, `branch_id`, `product_family_id`, geometry (trim/bleed/page count), and file paths (`base_pdf_path`, `preview_path`, `base_transparent_path`).
- The base artwork lives at `artwork-templates/{template_id}/base.pdf` in S3, so a copy must get its own file under the new id — sharing the path would break if either side re-uploads.
- Placeholders live in `artwork_template_placeholders`, keyed by `template_id`, and carry position, page scope, colours, text styling and shared `field_key`s.
- Write policies on both tables call `user_is_tenant_admin(tenant_id)`, which returns true for any platform admin. So a platform admin can already insert into another tenant — **no migration or policy change is needed**.
- The Templates tab (`ArtworkTemplatesTab`) is rendered from Admin → Products and is already tenant-locked: it refuses to write when the selected template belongs to another tenant.

## How it will work

Per your answers: platform admins only, same product family, and the copy keeps the source's published/draft state.

1. A **Copy to…** button appears next to each template in the Templates tab, visible only to platform admins.
2. The dialog shows: the source template name, a tenant picker (all tenants), an optional branch picker for that tenant ("Whole tenant" or a specific branch), and an editable name for the copy (defaults to the source name).
3. Destinations where the same product family isn't available are flagged, so a layout can't be copied into a tenant that doesn't sell that product.
4. On confirm, the copy runs: new template row → base PDF, transparent base and thumbnail copied to the new id's folder → all placeholders re-created against the new template. If any file copy fails, the new template is left as a draft with a clear warning rather than half-published.
5. The result is a completely independent template. Editing the copy never touches the original, and it stays inside the destination tenant per the existing isolation rules.

You can also use the same dialog to copy inside one tenant (tenant → one of its branches) since branch is just another destination.

## Verification

- Copy the 2027 Edition calendar layout into the Impress Print tenant: the copy appears only under Impress Print's product, with all 13 pages, correct bleed and every placeholder in the same position.
- Open both copies and confirm edits to one do not appear on the other, and the base PDFs are separate objects.
- Confirm a tenant admin (non-platform) sees no Copy button and still cannot read or write another tenant's templates.

## Technical notes

- New `useCopyArtworkTemplate` mutation in `src/hooks/useArtworkTemplates.ts`: insert the cloned row (omitting `id`, remapping `scope_type`/`tenant_id`/`branch_id`), then `copyObject`-style download + re-upload via `src/lib/s3Storage.ts` helpers to `artwork-templates/{newId}/…`, then bulk-insert placeholders with the new `template_id`.
- New `src/components/admin/CopyArtworkTemplateDialog.tsx` for the destination picker; wired into `src/components/admin/ArtworkTemplatesTab.tsx` behind `isPlatformAdmin` from `useTenantContext`.
- Destination availability is checked against the tenant's product families / product toggles for the same `product_family_id`.
- No schema, grant or RLS change required.
