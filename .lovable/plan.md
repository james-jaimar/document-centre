# Fix the broken booklet imposition (INV-01003-1)

## Cause (confirmed on the real file)
I downloaded the imposed booklet and checked it. The positioning instruction for one page is written with a number like `1.2e-14`, which is scientific notation. PDF files don't allow that. The number should just be 0. So Acrobat reports a page error, and the page placed by that instruction can go missing or end up in the wrong spot.

It happens in the shared step that places each page onto the press sheet. The booklet layout triggers it because the left-hand page sits right on the sheet edge, which produces a tiny rounding value next to 0. The 2-up layout uses the same step, so it could break the same way.

## Fix
- In the PDF server's page-placing step, write every number as plain decimals (6 decimal places). Treat tiny values as 0. Do the same for the optional rotation numbers.
- Check the other places that write positioning numbers (crop marks and overlays) for the same issue.
- Add a test that imposes a booklet and checks the result for these errors.
- After the PDF server redeploys, re-impose INV-01003-1 and check it opens cleanly.

## Technical details
- `pdf-server/app/services/pdf_ops.py` `_place_with_bleed`: use a `_num()` formatter (`f"{v:.6f}"`, with abs < 1e-9 → 0) for `sx sy ox oy` and the `extra_matrix` terms.
- Search `pdf_ops.py` for other `cm".encode()` f-strings and apply the same formatter.
- New pytest: booklet A4 → SRA3, assert no `e-` exponent tokens in the page content streams.
- Separate, still open: the A5 → A4 bleed scaling issue from earlier.
