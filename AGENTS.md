# Architecture rules

- Keep watermark density normalisation in the artwork value helpers and apply it on hydration, edits and spec saves; store the explicit original-density opt-in alongside effective opacity so browser proofs and the existing PDF compositor agree without changing immutable placed orders.
- Remap all editable artwork-family storage references through the shared cart-clone helper after matching copied document paths; fail on copy or persistence errors rather than share deletable originals, so replacing a cart item cannot strand its artwork.