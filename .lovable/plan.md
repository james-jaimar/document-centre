

## Realistic colored PVC tab dividers — solid sheet + matching protrusion

### Problem

Pre-made colored tab dividers are **solid PVC** dyed all the way through — the protrusion AND the full sheet are the same color. Currently:
- The tab sheet body renders **light gray** (`#e8e8e8`) regardless of color choice.
- Multicolor cycle order is `red → blue → green → yellow → orange`. The user wants **blue → red → orange → yellow → green** (then repeats).
- For multicolor sets, only the protrusion gets a color; the sheet body stays gray.

### Reference (from uploaded product images)

- Standard 5-tab and 10-tab packs are sold in a fixed cycle of **blue, red, orange, yellow, green**, repeating for the 10-tab pack.
- Each divider sheet is solid PVC — the entire A4 sheet is the tab's color, with the tab protrusion an integral extension of that sheet.
- Tab heights are equal: `pageHeight / tabsPerBank` (already implemented correctly via banking).

### Changes

**1. `src/components/preview/previewTypes.ts`**

Reorder `TAB_COLORS` to the correct PVC cycle:
```ts
export const TAB_COLORS = ["#3b82f6", "#ef4444", "#f97316", "#eab308", "#22c55e"];
// blue, red, orange, yellow, green
```

**2. `src/components/preview/PageEffects.tsx`**

Replace the gray `TAB_CARD_COLOR` constant with a small palette + resolver so `role === "tab"` and `role === "tab_back"` render the same solid color the protrusion uses. Add a `tabIndex`/`tabTotal` prop or piggy-back on existing `color` slug + `pageIndex` info already available.

Simpler: PageEffects already receives `color` (slug) per page. We extend the `color` field for tab pages so it carries the **resolved hex** (passed in upstream from `buildPreviewSnapshot.ts` / `PreviewPanel.tsx` where multicolor cycling happens). PageEffects then renders both `tab` and `tab_back` faces with that hex as background. White tabs continue to render as `#f5f5f5` paper-style (not gray).

```ts
// New TAB_BODY_COLORS resolver mirroring the protrusion logic
function resolveTabBodyColor(slug: string): string { ... }

if (role === "tab" || role === "tab_back") {
  const bg = resolveTabBodyColor(color || "white");
  // Solid sheet edge-to-edge; protrusion overlay handles the tab itself
  return <div className="w-full h-full" style={{ backgroundColor: bg, boxShadow: PAPER_SHADOW }}>
    {role === "tab" && <CenteredLabel text={label} dark={isLightColor(bg)} />}
  </div>;
}
```

White tab variant keeps the off-white card look (`#f5f5f5`) so white labels remain legible.

**3. `src/lib/orders/buildPreviewSnapshot.ts` and `src/components/order/PreviewPanel.tsx`**

Where `pageColors` is built and where `tabPositions` is built, when the divider set is **multicolor** (no per-tab override and tab count > 1, matching today's `isMultiColor` flag), assign each tab page (front face + back face) a cycled color from the new `TAB_COLORS` order based on its `tabIndex`. Today this cycling only happens inside `TabOverlay`; we lift it to snapshot time so both protrusion AND sheet body get the same hex.

The cycled color is written into `page.color` for both `pageIndex: 0` and `pageIndex: -1` faces of each tab section. `TabOverlay`'s `resolveTabColor` keeps working unchanged (it already reads `tab.color`).

**4. `src/components/preview/FlipBook.tsx` — `resolveTabColor`**

Update the named-color map to match the new palette (already mostly in sync; just confirm `red`, `blue`, `orange`, `yellow`, `green` map to the same hexes as the new `TAB_COLORS` for visual parity between protrusion and sheet body).

### Files changed

| File | Change |
|---|---|
| `src/components/preview/previewTypes.ts` | Reorder `TAB_COLORS` to blue/red/orange/yellow/green |
| `src/components/preview/PageEffects.tsx` | Render `tab` + `tab_back` faces as solid color (using resolved color slug/hex), white = off-white card |
| `src/lib/orders/buildPreviewSnapshot.ts` | When multicolor, write cycled hex into `page.color` for both tab faces |
| `src/components/order/PreviewPanel.tsx` | Same cycling logic for the live preview path |
| `src/components/preview/FlipBook.tsx` | Sync named-color map to new palette so protrusion + body match exactly |

### Result

- **White tab pack**: sheet looks like off-white card (`#f5f5f5`), protrusion light gray with dark label — unchanged behaviour.
- **Multicolor 5-tab pack**: tabs cycle **blue → red → orange → yellow → green**. Each divider sheet AND its protrusion are the same solid PVC color.
- **Multicolor 10-tab pack**: cycle repeats — blue, red, orange, yellow, green, blue, red, orange, yellow, green. Banking (already correct) splits them into two columns of 5.
- Labels overlay the colored sheet in white (or dark for yellow) — readable on every color.

