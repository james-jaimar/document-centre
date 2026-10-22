# Architecture rules

- Keep watermark density normalisation in the artwork value helpers and apply it on hydration, edits and spec saves; store the explicit original-density opt-in alongside effective opacity so browser proofs and the existing PDF compositor agree without changing immutable placed orders.