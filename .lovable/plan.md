## Homepage messaging refresh

Goal: reposition the landing page so it accurately reflects what Document Centre actually does today — a beautiful self-service customer experience backed by a serious production engine — and remove the two claims we don't support (artwork templates, variable data).

### What changes

**1. Hero bullet list (`src/pages/MarketingLanding.tsx`, ~line 440)**

Replace the 6 hero check-bullets. Out: "Artwork templates & variable data". In: bullets that describe what we really do. Proposed set:

- Online ordering & file upload
- Combine multiple files into one job
- Auto-rotation, preflight & imposition
- Live previews & instant proofing
- Built-in workflow & job tracking
- For copy shops, in-plants & corporate print

**2. Hero sub-headline (~line 436)**

Tweak to lead with the "customer does the heavy lifting, you get a print-ready job" angle:

> A beautiful self-service experience your customers will love — with the production muscle (auto-rotation, imposition, preflight, job tracking) doing the heavy lifting behind the scenes.

**3. Audience line in CTA (~line 654)**

Change "copy shops & printers" to cover the three real audiences:

> Loved by copy shops, small printers, in-plants & corporate print departments.

**4. Features grid card (~line 491)**

The "Product Catalogue" card currently says "Customisable templates, finishes & pricing" — drop "templates" since that implies artwork templates. New copy:

- Title unchanged: "Product Catalogue"
- Description: "Configurable products, finishes, paper stocks & live pricing"

**5. Add a small "Production muscle" strip (optional, recommended)**

Between the Features grid and the "Why printers choose" section, add a slim band (no new images needed) listing the heavy-lifting capabilities so the message lands clearly. Four pill-style items in one row using existing `dc-card` styling and brand colours:

- Combine & re-order multiple files
- Auto-rotation & page orientation fixes
- Automated preflight checks
- Imposition built in
- End-to-end job tracking & workflow

This makes the "it's got everything" point explicit without changing layout structure.

### What stays the same

- Visual design, ribbons, hero image, laptop/phone mockups, kanban screenshot, testimonial, CTA layout, trust icons, footer.
- All routes, components outside `MarketingLanding.tsx`.

### Files touched

- `src/pages/MarketingLanding.tsx` — copy edits in hero bullets, hero paragraph, one feature-card description, CTA paragraph; small new "Production muscle" strip section.

No new assets, no new dependencies, no routing changes.
