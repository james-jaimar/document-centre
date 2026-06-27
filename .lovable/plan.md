## Goal
The Templates editor currently nests three Cards inside a constrained `max-w-7xl` page, each with their own padding, borders, and scrollbars — producing the "windows within windows" you're seeing on a laptop. The preview iframe also sits inside a padded card inside a padded grid column, so usable width is ~30% of the screen.

## Changes (Templates tab only — Compose and History untouched)

1. **Drop the page width cap on the Templates tab**
   - Keep `max-w-7xl` for Compose/History, but render Templates full-width with tight outer padding (`px-4`) so it uses the full laptop viewport.

2. **Remove the nested Cards in the editor**
   - Replace the three `<Card>` wrappers (Templates list / Editor / Live preview) with a single flat 3-pane layout using borders + dividers instead of card chrome.
   - New grid: `grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]` with `divide-x` and no inner padding cards. Each pane scrolls independently inside one outer frame — no double scrollbars.

3. **Sticky preview pane**
   - Make the right pane `sticky top-0 h-[calc(100vh-8rem)]` so the live preview stays in view while you scroll the editor on a short laptop screen.
   - Remove the EmailPreviewFrame's outer light-grey padded chrome (`p-3 bg-[#f5f5f7] max-h-[640px]`) and let the iframe fill the pane. Keep the desktop/mobile toggle.

4. **Collapse the merge-token block**
   - Combine the two token rows ("Insert into body" / "Insert into plain-text fallback") into one row of chips with a small "target: body / plain-text" segmented toggle. Saves ~80px vertical.
   - Move the "Edit raw HTML" switch and Save button into a single sticky toolbar at the top of the editor pane so Save is always reachable without scrolling.

5. **Hide the templates list on narrow viewports**
   - Below `lg`, replace the left pane with a `<Select>` of template names above the editor. The current sidebar already eats width on a 1260px laptop.

6. **Tighten the EmailPreviewFrame**
   - Remove its internal `max-h-[640px]` cap so it grows with the pane.
   - Reduce the desktop preview width from 640 → fit-to-pane (use `width: 100%` with a max of 640) so it doesn't trigger a horizontal scrollbar inside the iframe wrapper.

## Files touched
- `src/pages/platform/PlatformCommunications.tsx` — TemplatesTab layout only.
- `src/components/admin/EmailPreviewFrame.tsx` — relax sizing/chrome.

## Out of scope
- No backend, no email-sending, no template content changes.
- Compose and History tabs unchanged.
