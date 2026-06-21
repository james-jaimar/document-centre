The user has chosen the "Operator tactile high-contrast" direction for the Production panel at the bottom of order detail pages. The goal is to make download and re-generate actions unmistakable for non-technical operators without adding new PDF operations or making the panel much taller.

Scope
- Only `src/components/orders/detail/ProductionPanel.tsx` and the design-system tokens it consumes.
- No changes to `useProductionArtefacts`, the pdf-server, or order job workflows.

What will change

1. Button hierarchy and colour
   - "Download" becomes a solid primary button (`bg-primary text-primary-foreground`) with an icon + text label, not a muted outline icon button.
   - "Re-generate" / "Assemble" / "Impose" / "Print ticket" becomes a solid secondary/outline button that sits next to the download action.
   - Both buttons grow slightly (h-8 / h-9, heavier font-weight) and gain a subtle shadow so they read as physical affordances.
   - Disabled and loading states keep the existing spinners but use the new sizes.

2. Row/icon treatment
   - Each file row gets a larger, coloured icon backing:
     - Print-ready PDF → primary/soft-blue tinted background.
     - Imposed sheet → success/emerald tinted background.
     - Job ticket → warning/gold tinted background.
   - Row labels keep their text but the filename drops to a slightly more muted code-style span, matching the prototype.

3. Microcopy and grouping
   - "Force rebuild" moves from a far-right ghost link into a small text link directly under the Print-ready steps box, colour-matched to primary so it is findable but not competing.
   - The imposition picker keeps its select but gains a small section label ("Imposition Setup") and the imposed sheet row sits directly beneath it as a single action block, separated by a hairline.

4. Token discipline
   - All colours come from existing CSS variables (`--primary`, `--secondary`, `--muted`, `--success`, `--warning`, `--info`, etc.) mapped through Tailwind utilities such as `bg-primary`, `text-primary-foreground`, `bg-primary/10`, `text-success`, `bg-success/10`.
   - No hard-coded hex colours (no `bg-indigo-600`, `bg-emerald-600`, `bg-amber-600`, `bg-slate-900`).
   - Dark mode is respected automatically because every colour resolves through the design-system variables.

5. Preserved behaviour
   - Clicking Download still fetches the signed S3 URL and triggers a same-origin download with the meaningful filename.
   - Re-generate still calls the matching `generate*` function.
   - Force rebuild, Retry auto-assemble, and disabled reasons ("Assemble print-ready first", "No templates assigned", etc.) all remain intact.
   - Loading and opening spinners keep their current placement.

Verification
- Smoke-test in the branch/admin order detail preview: the three rows must show high-contrast Download + Re-generate buttons.
- Confirm hover/focus states and that buttons still trigger downloads and generation.
- Confirm no visual regressions in dark mode by checking the preview theme toggle if available.

Files changed
- `src/components/orders/detail/ProductionPanel.tsx` (visual refactor only)