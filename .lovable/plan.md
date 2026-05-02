
## Three tweaks for the poster workflow

### 1. Fix toast message: "Added as Front Cover" → "Added as Print"

**File**: `src/pages/dashboard/OrderFiles.tsx` (line ~1424)

Add a poster case to `labelMap`:
```
front_cover: familySlug === "posters" ? "Print" : familySlug === "brochures" ? "Outside" : ...
```

### 2. Hide "Single-page cover" hint for posters

**File**: `src/components/order/SectionList.tsx` (lines 131-134, 274-278)

The `isSinglePageCover` flag triggers cover-specific messaging ("Single-page cover -- back is blank. Upload a 2-page PDF..."). For posters, the section type is `front_cover` but it is not semantically a cover. Exclude posters from this logic by adding `&& familySlug !== "posters"` to `isSinglePageCover`.

### 3. Make PosterImageEditor modal responsive

**File**: `src/components/order/PosterImageEditor.tsx`

- Change `max-w-3xl` to include responsive constraints (e.g. `max-w-[95vw] sm:max-w-3xl`)
- Reduce the fixed cropper height on small screens: change `style={{ height: 420 }}` to use a responsive value (e.g. `h-[50vh] sm:h-[420px]`)
- Ensure the controls area scrolls if needed on very small viewports
