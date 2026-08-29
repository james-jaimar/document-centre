# Print-ready "nothing changed" message on INV-00137-1

## What the data shows

I checked the actual rows before proposing anything:

- Order INV-00137 was submitted at 13:11 today; the job INV-00137-1 has its **own** print-ready PDF at
  `.../INV-00137-1/templated-artwork/d5a7967b-….pdf`, assembled at **13:39**, with spec hash
  `c8de6d52…`.
- The previous order's job INV-00136-1 has a **different** path and a **different** hash (`fe2ce8e0…`).
- The two jobs' artwork differs (different uploaded image paths, different text line, different trim
  offsets), so the fingerprints are genuinely unique per order.

So the system did not confuse the two orders. The cache key is computed per job and compared only
against that same job's stored hash. What happened is that the PDF for INV-00137-1 had **already been
assembled at 13:39** (auto-assembly fires when the order is confirmed/paid). The click a couple of
minutes later found an up-to-date artefact and correctly reused it — but the wording ("hasn't changed,
returning the previous file") reads like it picked up someone else's job.

## The real problem: the message, not the pipeline

The toast and panel don't tell you *which* file you're looking at or *when it was built for this job*,
so a legitimate cache hit is indistinguishable from a cross-order mix-up.

## Changes

1. **Rewrite the reuse toast** in `useProductionArtefacts.ts` to say plainly that this job's print-ready
   PDF was already generated (with the timestamp), not that "nothing changed".
2. **Show provenance in the Production panel** (`ProductionPanel.tsx`): job number embedded in the
   artefact path, assembled-at timestamp, and a short spec-hash chip, so it is visually obvious the file
   belongs to this job.
3. **Make first-generation implicit**: if the artefact was assembled *after* the job was created and the
   spec hash matches, label the button "Regenerate" instead of "Generate", so a fresh order that was
   already auto-assembled doesn't look broken.
4. **No pipeline/cache-key change** — the fingerprint is already correct and per-job. I will not bump the
   pipeline version or weaken the cache.

## Optional follow-up (say the word)

If you'd rather never see a cache hit from the admin button, I can make the manual Generate button always
force a rebuild and keep the cache only for the automatic fan-out. That costs render time on every click.

## Technical notes

- Cache logic: `pdf-server/app/tasks/production_tasks.py` (templated-artwork branch, lines ~207-240).
  It compares `pdf_ops.spec_hash(ta_spec_inputs)` against `order_jobs.print_ready_spec_hash` for the
  same job row only — no cross-job lookup exists.
- All work in this plan is front-end (`src/hooks/useProductionArtefacts.ts`,
  `src/components/orders/detail/ProductionPanel.tsx`); no pdf-server redeploy needed.
