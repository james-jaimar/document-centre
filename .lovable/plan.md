## Problem

Business Cards lamination only prices correctly for **Matt Lamination both sides**. The other three options either price wrong or not at all:

| Selected | Selected slug | Current behaviour | Should be |
|---|---|---|---|
| Matt both sides | `matt-lam-ds` | R602 ✓ | R602 |
| Matt 1 side | `matt-lam-ss` | R602 ✗ (charged as DS) | R506 |
| Gloss both sides | `lam-gloss-ds` | no charge ✗ | R602 |
| Gloss 1 side | `lam-gloss-ss` | no charge ✗ | R506 |

### Root cause

`src/lib/calculatePrice.ts` ~lines 408–474 hard-codes a tiny string-match:

```ts
const finish = lamination.includes("matt") ? "matt-lam"
             : lamination.includes("gloss") ? "gloss-lam"
             : lamination.includes("soft")  ? "soft-touch"
             : "none";
const lamCode = finish === "matt-lam"  ? "matt-lam-ds"
              : finish === "gloss-lam" ? "gloss-lam-ds"
              : finish === "soft-touch"? "soft-touch-ds" : null;
```

Two bugs:
1. Single-sided (`-ss`) info is thrown away — every matt selection looks up `matt-lam-ds` (R4) instead of `matt-lam-ss` (R2).
2. The real catalogue code for gloss is `lam-gloss-ds` / `lam-gloss-ss`, **not** `gloss-lam-ds`. So gloss never resolves and nothing is added.

The product option already stores the catalogue slug directly (`matt-lam-ss`, `lam-gloss-ds`, `lam-none`, etc.) — we just need to use it instead of guessing.

## Fix

Make the lamination lookup catalogue-driven instead of hard-coded. One file, one block.

**`src/lib/calculatePrice.ts`** (business-cards branch, ~lines 408–486):

1. Read the selected lamination slug verbatim (`opts["Lamination"]`, fall back to `opts.finish`).
2. Treat `"none"`, `"lam-none"`, empty, or unknown as "no lamination".
3. Resolve against `rc.finishing` by matching the slug to the row code (case-insensitive), accepting either the raw code or the size-suffixed code the rate-card adapter emits, and require `category === "lamination"`:
   ```ts
   const lamRow = (rc.finishing ?? []).find(r =>
     r.is_active &&
     (r.category ?? "").toLowerCase() === "lamination" &&
     (r.code.toLowerCase() === slug ||
      r.code.toLowerCase() === `${slug}-sra3`) &&
     (r.size ?? "").toUpperCase().includes("SRA3"),
   );
   ```
4. Keep the existing 21-up sheet maths (`Math.ceil(packSize / 21) * billedQty`) and the breakdown line — only the code resolution changes.

No other call sites, no UI changes, no DB migration.

## Verification (Pack 1000, base R410)

| Selection | Sheets | Unit | Lam total | Grand total |
|---|---|---|---|---|
| No Lamination | – | – | R0 | R410 |
| Matt 1 side (`matt-lam-ss`) | 48 | R2.00 | R96 | **R506** |
| Matt both sides (`matt-lam-ds`) | 48 | R4.00 | R192 | **R602** |
| Gloss 1 side (`lam-gloss-ss`) | 48 | R2.00 | R96 | **R506** |
| Gloss both sides (`lam-gloss-ds`) | 48 | R4.00 | R192 | **R602** |

Breakdown popover should show the catalogue row label (e.g. "Gloss Lamination 1 side — 48 sheets (21-up on SRA3)") for each.
