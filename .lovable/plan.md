## Goal

Make the document size impossible to miss on an admin job, and warn when the chosen imposition template doesn't match that size.

## Changes

### 1. Size banner at the top of Job Details (`src/components/orders/detail/JobDetailPanel.tsx`)
- Add a prominent size strip directly under the Job ID / status badges, above the preview button:
  - Large bold size text (e.g. `A5 · 148 × 210 mm`), plus an orientation label (Portrait/Landscape) when width/height are known.
  - High-contrast semantic styling (primary/accent tinted panel with border), not a small grey label.
- Source of the value, in priority order: the existing `summary.primary_spec_*` entry labelled "Size"/"Document Size", then the configuration section item labelled "Document Size", then the job snapshot trim dimensions. No new data fetching.

### 2. Emphasise the inline size rows
- In the summary specs grid and in each configuration section, when a row's label is Size / Document Size / Finished Size, render the value in bold with a slightly larger type size and a subtle highlight so it reads differently from surrounding spec rows.

### 3. Size indicator in Imposition setup (`src/components/orders/detail/ProductionPanel.tsx`)
- Accept a new optional prop for the job's trim size (label + width/height mm), passed down from `JobDetailPanel`.
- Render a bold "Job size: A5 (148×210 mm)" chip on the Imposition setup header row, right next to the section title, so it's visible at the moment the template is picked.
- Add a mismatch warning: when a template is selected whose `input_width_mm`/`input_height_mm` differ from the job size (±1 mm, either orientation), show an amber inline warning under the select — e.g. "This template expects A4 (210×297 mm) but the job is A5 (148×210 mm)." The template stays selectable; this is advisory only.
- Templates in the dropdown that match the job size get a small "matches job size" marker so the right one is easy to spot.

## Technical notes
- Purely presentational; no schema, pricing, or generation-logic changes.
- Size comparison reuses the existing ±1 mm, orientation-agnostic tolerance already implemented in `ProductionPanel`'s auto-select effect.
- Job trim size comes from `artefacts.assembly_report.target` when available, falling back to the snapshot size passed from `JobDetailPanel` (so the chip still shows before assembly runs).
- Colours use existing semantic tokens (`primary`, `warning`) — no hardcoded colour utilities.
