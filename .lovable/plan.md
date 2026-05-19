# Pure-K text: add mutool-first conversion with verifier-gated escalation

## Why the current two-pass still gives 98 % K

The two-pass Ghostscript pipeline we shipped is theoretically correct (CMYK with `-dBlackText/-dKPreserve=2`, then CMYK→Gray), but Ghostscript's `pdfwrite` device re-tags converted text objects with its **DefaultGray** ICC profile on the second pass. That profile has a tone curve, so even text that entered Stage B as `DeviceCMYK 0,0,0,1` re-emerges as DeviceGray ≈ 0xE6 in some source PDFs (notably anything LibreOffice/Word-exported via sRGB tags). That's the 98 % we're seeing in Acrobat.

mutool 1.23.10 (now confirmed installed on the VPS) uses MuPDF's colour engine, which honours `colorspace=gray` literally — RGB(0,0,0) text becomes `DeviceGray 0` with **no profile round-trip**. Industry experience (and the MuPDF source) confirms this is the cleanest path for the customer-uploaded-Word-PDF case we care about.

## The plan

Make `grayscale()` a strategy ladder with a hard verifier gate. Each strategy runs, then `verify_pure_black_text()` must report `min_k_pct >= 95` and `max_cmy_pct <= 5` for the result to be accepted. If it fails, we escalate to the next strategy. We log which strategy won into the assembly report.

### Strategy ladder (in order)

1. **mutool convert → gray**
   `mutool convert -F pdf -O colorspace=gray,compression=flate,garbage=compact -o out.pdf in.pdf`
   Followed by `mutool clean -ggg out.pdf out.pdf` to normalise/garbage-collect.
   Fast, single process, preserves pure K for text/vector.

2. **Two-pass Ghostscript CMYK → Gray** (current code, kept as fallback)
   Existing Stage A + Stage B.

3. **Single-pass Ghostscript Gray** (legacy last-resort fallback, current code)

### Verifier becomes a gate, not just a report

`verify_pure_black_text()` currently returns metrics into the report. We promote it to a gate inside `grayscale()`:

```text
for strategy in [mutool, gs_two_pass, gs_single_pass]:
    run(strategy) → candidate.pdf
    metrics = verify_pure_black_text(candidate)
    if metrics.pure_k_ok:   # min_k_pct >= 95 and max_cmy_pct <= 5
        promote candidate → out_pdf
        return {strategy, metrics}
    else:
        log warning, try next
# if nothing passes, return last candidate with metrics so operator sees it
```

The selected strategy + its metrics get attached to `report["colour_check"]` in `production_tasks.py` (already wired — we just enrich the payload).

### Config

Add to `app/core/config.py`:
- `mutool_bin: str = "mutool"` (alias `MUTOOL_BIN`).

Verify with `shutil.which`; if missing, the strategy is skipped and we fall straight to GS.

### Cache invalidation

Bump `colour_pipeline_version` from `2` → `3` in `production_tasks.py` so the existing INV-00057-3 artefact re-assembles.

## Files touched

- `pdf-server/app/core/config.py` — add `mutool_bin`.
- `pdf-server/app/services/pdf_ops.py` — add `_grayscale_via_mutool()`; rewrite `grayscale()` as a verifier-gated ladder; keep existing GS code as `_grayscale_via_gs_two_pass()` + `_grayscale_via_gs_single_pass()`.
- `pdf-server/app/services/diagnostics.py` — add mutool to the binaries check.
- `pdf-server/app/tasks/production_tasks.py` — bump `colour_pipeline_version` to 3; record `strategy` in `colour_check`.

No frontend, DB, or admin-setting changes.

## Verification on the VPS

1. `git pull` and restart workers (heavy + light).
2. Re-assemble INV-00057-3 (cache miss is automatic from the version bump).
3. Acrobat → Output Preview → SWOP simulation should show **Process Black 100 %, C/M/Y 0 %** on text.
4. Admin panel → `assembly_report.colour_check` shows e.g.:
   ```text
   { strategy: "mutool", min_k_pct: 100, max_cmy_pct: 0, near_black_pixels: 18420, pure_k_ok: true }
   ```
5. If mutool ever fails the verifier on a weird source, the report will show `strategy: "gs_two_pass"` with its own metrics — full audit trail.

## Risks

- mutool's `colorspace=gray` re-encodes embedded fonts; on rare PDFs with broken font dicts it may warn. The verifier-gated ladder catches that automatically and falls back to GS, so a failure here is not a customer-facing regression.
- Adds at most one extra rasterised page-1 verify per attempt (~0.3 s). Cached after first run.
