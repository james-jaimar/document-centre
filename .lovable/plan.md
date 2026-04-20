
The user can't find the "View customer preview" button on admin/branch order detail pages. Likely cause: `JobDetailPanel` was added to admin's `AdminOrderDetail.tsx`, but the customer-side preview snapshot for the order being viewed has empty thumbnails (same root issue we just fixed for new orders only — old orders still have empty snapshots).

Let me check.
