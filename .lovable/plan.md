
## Root cause

The worker IS capable of converting to greyscale — but on this job it was never asked to.

In `src/lib/orders/buildJobSnapshot.ts` (line 468) we deliberately strip `Print Colour` and `Print Sides` from `selected_options` because they're driven by document sections, not by product options:

```ts
const SECTION_CONTROLLED_KEYS = new Set(["Print Colour", "Print Sides"]);
```

The truth for these two lives in `product_snapshot.sections[].is_color` / `.is_duplex`.

But `pdf-server/app/services/production_orchestrator.py::_extract_target_spec` ONLY reads `product_snapshot.selected_options[].slug/label` to decide colour_mode. Since "bw" / "mono" / "black & white" are no longer there, it falls into the default branch:

```python
spec.colour_mode = "colour"   # default
```

So Step 5 in `production_tasks.py::assemble_print_ready_for_job` (`needs_greyscale = target.colour_mode == "bw"`) is never true, `pdf_ops.grayscale()` is never run, and the source PDF (CMYK in this case) is passed through unchanged. That's exactly what the user saw on INV‑00057‑3: customer chose Black & White but the print‑ready PDF stayed CMYK.

The same blind spot affects size to a lesser degree: if the size option is ever renamed away from containing the word "size" the heuristic also misses it, but for now Size / Document Size still resolves correctly via slugs ("a4" etc.), so this bug is colour‑specific.

## Fix (one file, no schema change)

Update `pdf-server/app/services/production_orchestrator.py::_extract_target_spec` to consult `product_snapshot.sections` as the **authoritative** source for colour, falling back to the existing slug/label heuristic only when there are no sections.

### Logic

```python
sections = snap.get("sections") or []
printable = [s for s in sections
             if s.get("section_type") not in ("tab", "insert")
             and s.get("is_color") is not None]

if printable:
    if all(s.get("is_color") is False for s in printable):
        spec.colour_mode = "bw"
    else:
        # Any colour section → keep whole doc colour-capable.
        # (Per-section greyscale before merge is a follow-up; today the
        # worker only has a whole-document grayscale step.)
        spec.colour_mode = "colour"
else:
    # existing slug/label heuristic stays as the fallback
    ...
```

Also include the per-section `is_color` flags in `spec_inputs` (the cache‑hash dict in `production_tasks.py` line 80) so an existing cached "colour" artefact gets invalidated when the same job is re‑assembled after this fix lands.

## Why this is enough for the reported case

- INV‑00057‑3 has a single Body section with `is_color = false` and `is_duplex = true`.
- After the fix, `target.colour_mode = "bw"`.
- `needs_greyscale` becomes true → `pdf_ops.grayscale(current, grey)` runs Ghostscript with `-sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray`, producing a DeviceGray PDF (no CMYK, no RGB).
- Size already resolves correctly from the `a4` slug; Duplex doesn't change the assembled PDF (it's a press-side instruction surfaced via the job ticket).

## Mixed-colour jobs (follow-up, NOT in this change)

When sections mix colour + B&W (e.g. colour cover, mono body), the current single‑pass `pdf_ops.grayscale` would over‑convert. The clean fix is: greyscale each B&W section file BEFORE merge, leave colour sections alone. That's a separate, larger change to the merge loop in `production_tasks.py` (greyscale each `local` before appending when its section has `is_color = false`). Call this out in `assembly_report.warnings` for now ("Mixed colour sections detected — whole document treated as colour"), and I'll handle the per-section path as a follow-up if you want it.

## Verification

1. Patch `production_orchestrator.py`, push to the VPS, restart workers (`document-centre-worker-heavy`, `document-centre-worker-light`).
2. Re-assemble INV‑00057‑3 with **Force re-assemble**.
3. Download the resulting `print_ready_pdf_path`; confirm with `gs -o - -sDEVICE=inkcov input.pdf` that C/M/Y inks are 0.00 and only K has coverage (i.e. DeviceGray).
4. `assembly_report.steps` should now contain `"greyscale"` and `target.colour_mode` should be `"bw"`.

## Files to change

- `pdf-server/app/services/production_orchestrator.py` — extend `_extract_target_spec` to read `product_snapshot.sections`.
- `pdf-server/app/tasks/production_tasks.py` — add section colour flags into `spec_inputs` so cached artefacts re-invalidate.

No frontend, no Supabase, no DB migration.
