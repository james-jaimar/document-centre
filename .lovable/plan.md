

# Physical Properties of Folded Brochures — and What's Wrong

## The physics, explained simply

### Half-fold (Bi-fold)

One A4 landscape sheet, folded once in the middle to create an A5 portrait leaflet.

```text
FLAT SHEET (A4 landscape, printed both sides):

    OUTSIDE (Side 1)              INSIDE (Side 2)
┌──────────┬──────────┐     ┌──────────┬──────────┐
│          │          │     │          │          │
│  BACK    │  FRONT   │     │ INSIDE   │ INSIDE   │
│  COVER   │  COVER   │     │  LEFT    │  RIGHT   │
│          │          │     │          │          │
└──────────┴──────────┘     └──────────┴──────────┘
  Panel 1     Panel 2         Panel 1     Panel 2
              ↑ fold
```

When you fold Panel 2 onto Panel 1 (fold at centre):
- **Closed, viewing from front**: You see the FRONT COVER (Outside Panel 2 = right half of Outside surface)
- **Closed, viewing from back**: You see the BACK COVER (Outside Panel 1 = left half of Outside surface)
- **Open, viewing inside**: You see the full Inside surface (left-to-right)
- **Open, viewing outside**: You see the full Outside surface (left-to-right)

Key insight: **When closed, you can only see one panel-sized face at a time** — either the front cover or the back cover. You do NOT see the inside at all.

### Tri-fold C-fold

One sheet with 3 panels. The right flap folds inward first, then the left panel folds over it.

```text
OUTSIDE:                        INSIDE:
┌────────┬────────┬────────┐   ┌────────┬────────┬────────┐
│ BACK   │INSIDE  │ FRONT  │   │INSIDE  │INSIDE  │INSIDE  │
│ COVER  │ FLAP   │ COVER  │   │ LEFT   │CENTRE  │ RIGHT  │
│(narrow)│        │        │   │(narrow)│        │(=flap) │
└────────┴────────┴────────┘   └────────┴────────┴────────┘
```

Closed: front = Outside Panel 3 (rightmost), back = Outside Panel 1 (leftmost).

### Z-fold

Three equal panels, alternating fold direction.

### Gate-fold

Four panels — two outer flaps fold inward to meet at centre.

---

## What's wrong in the current code

### Problem 1: "Show Inside" rotates the entire scene 180° — wrong model

`BrochureStage` does `transform: showBack ? "rotateY(180deg)" : undefined`. This flips the entire 3D scene around the Y axis, which means you're seeing the CSS back-faces of every panel — but those back-faces contain the *back of each individual panel*, not the "inside surface" of the sheet.

The correct behaviour: "Show Inside" should swap which surface image is mapped to panel fronts vs backs. When viewing the inside, panel fronts should show inside-surface artwork, and the folding logic stays the same.

### Problem 2: Panel image assignment is wrong

Currently in `FoldPreview.tsx`:
- `front` of each panel = slice from Outside surface (urls[0])
- `back` of each panel = slice from Inside surface (urls[1])

But physically, "front" and "back" of a CSS panel with `backface-visibility: hidden` are about which CSS face is visible based on rotation — NOT about which print surface they belong to.

For the Outside surface (viewing from outside):
- Panel faces visible when flat = the CSS "front" face

For the Inside surface (viewing from inside):
- The panels are in **reverse order** when viewed from the other side (because you flip the physical sheet)
- Panel 1's Inside content appears where Panel N is when you flip the sheet

### Problem 3: Space utilisation

The stage uses `maxWidth * 0.92` and caps height at `maxHeight * 0.65`. This wastes ~35% of the vertical space.

---

## Fix plan

### 1. Replace "Show Inside/Outside" with surface swap (not scene rotation)

**`BrochureViewer.tsx`**: Remove the `showBack` prop from `BrochureStage`. Instead, when "Show Inside" is toggled, rebuild the spec with swapped panel images:
- Outside mode: panel CSS-fronts = Outside surface slices (left-to-right)
- Inside mode: panel CSS-fronts = Inside surface slices (**reversed** order, because flipping a physical sheet mirrors the panel sequence)

**`BrochureStage.tsx`**: Remove the `rotateY(180deg)` transform entirely.

### 2. Fix image assignment in `FoldPreview.tsx`

Pass both surface URL arrays and the current viewing side down. When building the spec:
- **Viewing Outside**: `front` of panel[i] = outsideSlices[i]
- **Viewing Inside**: `front` of panel[i] = insideSlices[panelCount - 1 - i] (reversed)

No panel needs a `back` image — we only ever show one surface at a time, controlled by the toggle. This eliminates the broken `rotateY(180deg)` scene flip entirely.

### 3. Fix closed state for half-fold

When closed, only ONE panel face is visible. The current rotation `{ p1: 0, p2: -180 }` is correct mechanically, but the user should understand:
- Closed + Outside = Front Cover (panel 2's front face)
- Closed + "flip to back" = Back Cover (panel 1's front face, but viewed from behind)

Since we're removing the scene flip, for "closed back cover" view we can add a third state or note that the back cover is simply panel 1 visible behind panel 2.

### 4. Use more available space

**`BrochureStage.tsx`**: Change `maxWidth * 0.92` to `maxWidth * 0.95` and `maxHeight * 0.65` to `maxHeight * 0.85`. Remove hardcoded 3:2 aspect ratio — derive it from the actual panel images or use the `pageAspectRatio` prop.

### Files to change

| File | Change |
|------|--------|
| `src/components/preview/FoldPreview.tsx` | Accept `showBack` state, rebuild spec with swapped/reversed panel images per surface |
| `src/components/preview/brochure/BrochureViewer.tsx` | Own the `showBack` state, pass it to FoldPreview's spec builder instead of to BrochureStage |
| `src/components/preview/brochure/BrochureStage.tsx` | Remove `showBack` / scene-flip logic; increase space utilisation |
| `src/components/preview/brochure/BrochureControls.tsx` | No changes needed (toggle button already works) |

