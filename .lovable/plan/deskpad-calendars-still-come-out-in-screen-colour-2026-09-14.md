# Deskpad calendars still come out in screen colour

Confirmed from the job records, not guessed.

The wiro calendar and the deskpad were built by the same builder minutes apart, but their colour results differ:

- Wiro calendar (job 27EDIT-13004-1): `icc_attempt = core_icc` — the real colour conversion ran. This is the one that looks better.
- Deskpad (job 27EDIT-13004-2): `icc_attempt = already_cmyk` — the converter decided the file was **already** in press colour and copied it through untouched. Nothing was converted, so the customer's uploaded picture stayed in screen colour.

## Why it made that decision

Before converting, the print server does a quick check: "does this file already use press inks everywhere?" That check only looks at the top level of each page. A customer's uploaded PDF or picture is placed inside a nested container on the page, and the check never looks inside it. The deskpad's twelve uploaded pages sit in exactly such containers, so the page looked empty of screen colour and the whole file was waved through.

The wiro calendar had at least one screen-colour item visible at the top level, which is why it was converted properly. Same code, different artwork — that is the whole difference.

## What I'll change

1. Make the check look inside nested containers, to whatever depth they nest, so a placed PDF or picture can no longer hide screen colour from it. Anything it cannot read with certainty is treated as "needs converting" rather than "fine as is".
2. For calendar/deskpad/planner artwork, skip the shortcut entirely. These pages are always built from a mix of template artwork and customer uploads, so they should always get the one managed conversion and the press stamp — the shortcut saves seconds and costs colour.
3. Record on the job which route was taken, so "was this actually converted?" is answerable from the job record without digging.
4. Rebuild the deskpad print file for order 27EDIT-13004 and confirm the job then reports a real conversion, the press condition is stamped, and the colour matches the wiro calendar.

## Technical notes

- `pdf-server/app/services/pdf_ops.py`
  - `_is_already_cmyk`: walk `/XObject` entries of subtype `/Form` recursively (their `/Resources` → `/ColorSpace` and `/XObject`), plus `/Pattern` resources; cycle-guard on object id, depth cap ~8; return `False` on any unreadable branch (already the behaviour on exception).
  - `to_print_ready_cmyk`: add `allow_already_cmyk_fast_path: bool = True`; when `False`, skip the fast path outright.
- `pdf-server/app/services/templated_artwork_assembly.py` → `_colour_manage`: pass `allow_already_cmyk_fast_path=False`; keep `icc_attempt` in the report (already stored).
- Bump `templated_artwork_pipeline_version` 6 → 7 in `pdf-server/app/tasks/production_tasks.py` so cached deskpad/planner print files rebuild.
- Verify after redeploy: job `1d8aaa51-7f85-44ab-b1af-9da662dddd7c` should report `icc_attempt` of `rich_icc`/`core_icc`, `icc_converted: true`, `output_intent_stamped: true`, and no colour warnings.
