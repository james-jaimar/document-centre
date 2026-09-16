# GASA Order System Blueprint

This pack carries the order engine from Document Centre into the GASA apparel
SaaS. It is a snapshot, not a live link — the two projects sit in different
Lovable workspaces and cannot read each other.

## How to use it

1. Upload this whole folder into the GASA project.
2. Tell the assistant, in these words:

   > Read `01-architecture.md` first, then apply `02-schema.sql` as a migration,
   > then port the order engine following `engine/PORT-GUIDE.md`, using
   > `reference/order-engine.original.ts` as the source. Use the files in
   > `contract/` as the front-end contract. `03-naming-map.md` explains how
   > Document Centre's words map onto GASA's.

3. Do not let it "improve" the status model or the money handling on the first
   pass. Get a working copy first, change it after.

## What is in here

| File | What it is |
| --- | --- |
| `01-architecture.md` | Why the system is shaped this way. Read this first. |
| `02-schema.sql` | The database: tables, access rules, triggers, numbering. Runnable. |
| `03-naming-map.md` | tenant → brand owner, job → product line, etc. |
| `engine/PORT-GUIDE.md` | Exactly what to keep and what to delete from the engine. |
| `reference/order-engine.original.ts` | The real Document Centre engine, unedited (3,526 lines). |
| `contract/*.ts` | Types, status maps, read queries and write calls for the front end. |

## What travels

Orders, order jobs (line items), adjustments, addresses, documents, invoices,
payment attempts, pricing snapshots, timeline, status history, payments,
numbering. The status model and the money rules.

## What does not

Print/PDF/preflight/imposition, catalogue and pricing rules, delivery zones and
rates, credit accounts, supplier mirroring, quotes, sample packs, campaigns.
The schema keeps the seams where those plugged in, marked as extension points.
