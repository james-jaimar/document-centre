# Architecture rules

- Reuse TiersButton for catalogue paper-size and finishing price-row IDs, converting minor-unit defaults to ZAR; this keeps all scopes on the existing quantity-tier editor and pricing engine.

- Group bookshelf rows by the customer-chosen `snapshot.shelf_category` (set by order-engine beside the frozen spec, preserved on revise), falling back to the product-family label; shelf labels and cover shapes are presentation-only and must never change specs or pricing.
- Reuse BookshelfCover for shelf, detail, express-order, cart and checkout previews from saved/restored thumbnails and print selections; use the shared binding resolver and closed-front assets with clearance outside the clipped cover so all views agree without changing saved specifications.

- Store bookshelf products as private, versioned snapshots with independent PDF and thumbnail copies; restore into new drafts through order-engine and a service-only transaction so cart cleanup and artwork revisions cannot change saved products or placed orders.
- Require an explicit tenant-local bookshelf setting for reads and mutations, without platform fallback; use the existing builder for current pricing and preflight before bookshelf copies enter the cart.

- Keep watermark density normalisation in the artwork value helpers and apply it on hydration, edits and spec saves; store the explicit original-density opt-in alongside effective opacity so browser proofs and the existing PDF compositor agree without changing immutable placed orders.
- Remap all editable artwork-family storage references through the shared cart-clone helper after matching copied document paths; fail on copy or persistence errors rather than share deletable originals, so replacing a cart item cannot strand its artwork.
- Track invoice email sends from confirmed email_outbox sent transitions in a tenant/order-scoped database trigger, not enqueue responses; this covers both Cloud Run and legacy dispatchers without falsely reporting delivery.
- Preserve display-labelled custom selections in production snapshots and read raw selections for legacy job details/tickets; never reprice historical orders for a display fix.
- Apply placed-order artwork revisions through order-engine and a service-only atomic RPC; keep originals and prices, enforce tenant/production boundaries, retire old proofs/outputs and require renewed proof review.- Track signed-in presence only via the presence_heartbeat RPC (validates tenant membership, skips anonymous sessions) into user_presence; reads are RLS-scoped (platform admins all, tenant owners/admins their tenant) so no client-side filtering is trusted.
- Compute perfect-bound spine width in the shared spine helper (sheets × paper caliper + glue allowance) for preview and guidance only; never feed it into pricing.
- Keep perfect-bound covers as versioned document-ID selections separate from body sections; resolve frozen cover assets in production and remap IDs on cart/bookshelf copies so covers cannot consume inner pages or share deletable originals.
- Price full-wrap printing/stock with an explicit admin-authored per-book cover option, separate from body clicks and binding; require explicit production readiness before ordering so undeployed cover assembly cannot silently produce body-only jobs.
- Keep cover placement maths (frame fills trim+bleed at scale 1, mm offsets y-down) mirrored between workflow.placementFrame and pdf-server placement_frame; previews and the compositor must agree, and artwork is clipped to its own panel.
- Preview perfect-bound covers from browser rasters of the cover PDF's artwork box (TrimBox, or BleedBox with ~3 mm bleed), mirroring pdf-server artwork_box; server thumbnails are unreliable for covers cut from larger sheets.
