---
name: Admin quote mode (pending)
description: Admin/branch can build a quote for a customer without artwork by specifying dummy specs; system reprices when real artwork is uploaded
type: feature
---
Problem: current configurator requires uploaded artwork. Branches/admins need to quote customers who haven't sent files yet.

Design:
- New "Quote mode" toggle when admin/branch starts an order on a customer's behalf.
- In quote mode, admin enters specs directly (product family, size, page count, colour, sides, finishing, quantity) — no upload required.
- System injects a synthetic document stub matching the specs (e.g. 24pp A4) so pricing/options work end-to-end.
- Saved as a quote against the customer; customer receives standard quote email/link.
- When the customer opens the quote and uploads real artwork:
  - If specs match → keep price.
  - If specs differ (page count, size, orientation, colour usage) → show a clear diff and repriced total, warning that the price has changed from the original quote.
- Admin can also convert a quote to an order once artwork arrives.

Not yet implemented — needs configurator quote-mode branch, synthetic-doc plumbing, and quote→order artwork-upload reconciliation UI.
