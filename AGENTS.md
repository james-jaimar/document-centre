# Architecture rules

- Keep watermark density normalisation in the artwork value helpers and apply it on hydration, edits and spec saves; store the explicit original-density opt-in alongside effective opacity so browser proofs and the existing PDF compositor agree without changing immutable placed orders.
- Remap all editable artwork-family storage references through the shared cart-clone helper after matching copied document paths; fail on copy or persistence errors rather than share deletable originals, so replacing a cart item cannot strand its artwork.
- Track invoice email sends from confirmed email_outbox sent transitions in a tenant/order-scoped database trigger, not enqueue responses; this covers both Cloud Run and legacy dispatchers without falsely reporting delivery.
- Preserve display-labelled custom selections in production snapshots and read raw selections for legacy job details/tickets; never reprice historical orders for a display fix.
- Apply placed-order artwork revisions through order-engine and a service-only atomic RPC; keep originals and prices, enforce tenant/production boundaries, retire old proofs/outputs and require renewed proof review.