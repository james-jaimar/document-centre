# Fix the binding-image 404s and add a binding artwork audit page

## What's actually broken (proven, not guessed)

Built the project and inspected the output. Vite **does** bundle every binding PNG correctly — they appear in `dist/assets/`, e.g.:

```
dist/assets/comb binding black front-C_AVYPtf.png   32.62 kB   ← exists
```

But the browser requests `comb%20binding%20black%20front-C_AVYPtf.png` and gets a **404** from the published host (`document-centre.lovable.app`). The hash suffix (`-C_AVYPtf`) confirms Vite is generating the URL — the file simply isn't being served under that name by the CDN.

**Root cause: every binding PNG has spaces (and some parentheses) in its filename.** The Lovable static host doesn't reliably serve assets whose names contain spaces, even though Vite's dev server does. That is exactly why "it used to work" (dev) but breaks in the published build. This has nothing to do with the lookup table, the alias, or the registry — those are all correct.

The 41 files in `src/assets/bindings/` include names like:
- `comb binding black front.png`
- `coil clear (front) 210mm.png`
- `wire black - open 210mm.png`
- `coil white open 210mnm.png` (also has a typo)

All of these need safe filenames.

## The plan

### 1. Rename every binding PNG to a safe slug

Rename all 41 files in `src/assets/bindings/` so they contain only `[a-z0-9-]` and `.png`. Examples:

| Old | New |
|---|---|
| `comb binding black front.png` | `comb-binding-black-front.png` |
| `comb binding black front 210mm.png` | `comb-binding-black-front-210mm.png` |
| `coil clear (front) 210mm.png` | `coil-clear-front-210mm.png` |
| `wire black - open 210mm.png` | `wire-black-open-210mm.png` |
| `coil white open 210mnm.png` | `coil-white-open-210mm.png` (fix typo too) |

Done with a single `git mv` script (case-sensitive, deterministic). Nothing else in the codebase references these filenames except `src/components/preview/bindingAssets.ts`.

### 2. Update the imports in `bindingAssets.ts`

One file, mechanical search-and-replace of the 24 import paths. The lookup table itself doesn't change — same constants, same shape. Tests in `bindingAssets.test.ts` continue to pass unchanged because they only assert that `getBindingImage(...)` returns truthy, not the specific filename.

### 3. Verify with a production build

Run `bunx vite build` and confirm every emitted PNG name is space-free, e.g. `dist/assets/comb-binding-black-front-<hash>.png`. That's the fix proven, not just hoped for.

### 4. Add the admin audit page (the originally-requested feature)

New route at `/admin/binding-artwork-audit` (linked from `AdminProducts` or `AdminSettings`). It:

1. Loads every option in `BINDING_STANDARD` (the seeded binding catalog).
2. For each option, derives `(method, color)` exactly like `selectedBindingArt` does.
3. Calls `getBindingImage(...)` for all four required tuples: `{portrait, landscape} × {closed, open}`.
4. Renders a table:

```text
Option label              method     color    Portrait-Closed  Portrait-Open  Landscape-Closed  Landscape-Open
Comb Binding (Black)      comb       black    ✓ <thumb>        ✓ <thumb>      ✓ <thumb>         ✓ <thumb>
Spiral Binding (White)    spiral     white    ✓                ✓              ✓                 ✓
Wire Binding (Silver)     twin_loop  silver   ✓                ✓              ✓                 ✓
Comb Binding (White)      comb       white    ✗ MISSING        ✗ MISSING      ✗ MISSING         ✗ MISSING
Saddle Stitch             saddle     —        n/a              n/a            n/a               n/a
```

A red "Missing" badge with the exact tuple text (e.g. `comb / white / portrait / closed`) so anyone can read off precisely which PNG needs to be added to the registry. A summary line at the top says e.g. "3 of 11 binding options have complete artwork."

This is the single source of truth for "is the artwork pipeline healthy?" — no guessing, no console-spelunking.

## Files changed

- **Renamed** (41): everything in `src/assets/bindings/*.png` → safe-slug names.
- **Edited**: `src/components/preview/bindingAssets.ts` — update the 24 import paths.
- **Created**: `src/pages/admin/AdminBindingArtworkAudit.tsx` — the audit page.
- **Edited**: `src/App.tsx` — register the new route.
- **Edited**: `src/pages/admin/AdminProducts.tsx` (or sidebar) — add a link to the audit page.

## What I am explicitly NOT doing

- Not touching the lookup table shape, the `selectedBindingArt` helper, `BindingSpine.tsx`, or `buildPreviewSnapshot.ts`. They are correct.
- Not adding fallback ladders or "smart" resolution. The map stays blunt and direct, exactly as you asked.
- Not changing Vite config or the `@/assets` alias.

After this, the published build will load every PNG (no more 404s), and the audit page will tell you instantly if any option is ever missing artwork again.
