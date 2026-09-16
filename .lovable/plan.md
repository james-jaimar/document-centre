# Copy GASA Order Blueprint into docs/ for GitHub sync

## What happens

Copy the complete `gasa-order-blueprint/` folder from your Files into the project's `docs/` folder:

```text
docs/gasa-order-blueprint/
├── README.md
├── 01-architecture.md
├── 02-schema.sql
├── 03-naming-map.md
├── contract/   (7 files — types, status maps, queries, mutations, editability, invoice renderer)
├── engine/     (PORT-GUIDE.md)
└── reference/  (order-engine.original.ts)
```

Because the project is connected to GitHub with two-way sync, the new files push up to your GitHub repository automatically — no manual push needed.

## Notes

- It is a straight copy — the Files copy stays untouched, so you can still upload it into GASA from there.
- The SQL file is data/documentation only, sitting in `docs/` — nothing in the app reads it, so there is no build or runtime impact.
- After copying, I verify the GitHub sync picks the files up (they appear in the repo once the platform pushes).

## Out of scope

No changes to any app code, schema or settings.
