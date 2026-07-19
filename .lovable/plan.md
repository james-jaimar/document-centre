## What's actually happening

The customer uploaded `pull up banner2.pdf` at 850 × 2000mm — which now matches the "Pull Up Banner" catalogue custom size exactly. The chip shows "Review needed" but no dialog appears.

Two effects in `src/pages/dashboard/OrderFiles.tsx` fight each other:

1. **Non-ISO effect (line 923)** finds the doc because `preflight.detected_size` is set and `size_resolved` is false. The stale-classification guard (line 936) sees the dims now match an allowed custom size (850×2000mm), adds the doc id to the in-memory `resolvedDocIds` set, and returns — nothing else happens and nothing is persisted.

2. **ISO / custom-size effect (line 978)** would otherwise handle it (line 991 matches `matchesAnySize` against `allowedCustomSizes`), but line 982 bails out for any doc with `preflight.detected_size && !preflight.size_resolved`. So the doc is skipped here too.

Net result: doc stays `awaiting_review = true` forever, no modal opens, no lock is set.

## Fix

Edit `src/pages/dashboard/OrderFiles.tsx` only.

1. **Non-ISO effect**: when the stale-classification guard fires (dims now match ISO or an allowed custom size), persist the change to the DB instead of just marking it in memory — set `preflight_data.size_resolved = true`, `awaiting_review = false`, `detected_size` to the matched canonical name, then let the next render fall through to the ISO/custom-size effect. This clears the "Review needed" chip and unblocks downstream logic.

2. **ISO / custom-size effect**: relax the guard on line 982 so a doc whose current dimensions match ISO or an allowed custom size is not blocked by a stale `detected_size && !size_resolved` flag. This is a belt-and-braces guard in case (1) hasn't landed yet on that render.

No changes needed to `paperSizes.ts` or `PaperSizeAdvisory.tsx` — the 850×2000mm catalogue entry is being resolved correctly; the bug is purely in the OrderFiles effect coordination.

## Follow-up note (not part of this fix)

The user's earlier test file was 850 × **2200**mm while the catalogue is 850 × **2000**mm — 100mm out per side, well beyond the 3mm tolerance. If real pull-up artwork ships at 2200mm, the catalogue entry needs updating (or a second size added). Confirm the intended banner height before we touch the catalogue.
