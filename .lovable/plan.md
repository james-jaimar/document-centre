

# Restyle Order Files Page to Match Printflow Design

## What's Changing

The `/dashboard/orders/:id/files` page (Upload & Organise Files) needs to be restyled to use the printflow glassmorphic design system and restructured to match the Mimeo-inspired layout from the reference screenshots.

## Current vs Target Layout

Current: Three equal columns `[Files | Actions | Sections]` with an oversized upload dropzone dominating the left column.

Target (matching reference image-24):
```text
┌─────────────────────────────────────────────────────────────────┐
│  Upload & Organise Files                    ← Back  [Configure]│
│  Step 1 of 2                                                    │
├────────────────────────┬──────────────┬──────────────────────────┤
│  UPLOADED FILES        │ ADD SELECTED │  YOUR DOCUMENT           │
│  ┌──────────────────┐  │  FILE AS     │  ┌────────────────────┐  │
│  │ Drop PDFs here   │  │              │  │ Body Pages         │  │
│  │ or click browse  │  │ Front Cover →│  │ file.pdf           │  │
│  └──────────────────┘  │ Body Pages → │  │ ⬤Colour ⬤Duplex   │  │
│                        │ Back Cover → │  │                    │  │
│  file1.pdf  ✓          │ Insert     → │  │ ↑ ↓                │  │
│  file2.pdf  ✓          │ Tab Divider→ │  └────────────────────┘  │
│                        │              │                          │
│                        │ 🗑 Remove    │                          │
└────────────────────────┴──────────────┴──────────────────────────┘
```

Key differences from current:
- Upload dropzone is **compact** (smaller height, inside the left column but not dominating it)
- File list appears **below** the dropzone in the same column
- Section action buttons are styled as clean list items with arrows, not heavy buttons
- "Your Document" panel uses `section-card` styling with `section-header`
- Section items show section type as a badge/tag, filename, and colour/duplex toggle pills
- Header uses printflow styling with the teal "Configure Options →" button
- Overall wrapped in the printflow card aesthetic

## File Changes

| File | Change |
|------|--------|
| `src/pages/dashboard/OrderFiles.tsx` | Restyle with glass-card wrapper, printflow header with soft-button for "Configure Options", compact grid layout. Upload zone gets smaller. Section column uses `section-card` with `section-header`. |
| `src/components/order/FileUploader.tsx` | Reduce padding, use printflow border styling (`rounded-2xl border-dashed border-primary/30`), smaller cloud icon. More compact. |
| `src/components/order/FileList.tsx` | Style file rows with printflow card aesthetic — `rounded-2xl` items, subtle hover, teal check icons for ready status. |
| `src/components/order/SectionActions.tsx` | Restyle action buttons as clean sidebar-style list items with rounded styling, arrow icons, matching the reference's "Add Selected File As" column. |
| `src/components/order/SectionList.tsx` | Wrap in `section-card`. Section items use printflow badge pills for colour/duplex toggles (teal for active). Move arrows are subtle. |

## Design Specifics

- **Upload dropzone**: Reduced to `min-h-[140px]`, `rounded-2xl`, dashed border with `border-primary/30`, smaller upload icon
- **File rows**: `rounded-xl` with subtle border, teal `CheckCircle2` for ready files, selected state uses `border-primary ring-1`
- **Section actions column**: Clean text buttons with `→` arrows, `rounded-xl` hover states, "Remove Section" in destructive red at bottom
- **Document sections panel**: `section-card` wrapper with "YOUR DOCUMENT" as `section-header`. Each section shows badge + filename + colour/duplex pill toggles styled as `rounded-full` buttons with teal active state
- **Header**: "Configure Options →" as `soft-button soft-button-primary rounded-xl`
- **Grid**: `lg:grid-cols-[1.2fr_auto_1fr]` — left column slightly wider for file list, middle column auto-width for actions

