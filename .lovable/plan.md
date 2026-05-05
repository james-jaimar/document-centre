
# Branch-Aware Customer Portal

## Context

Currently, branches exist in the database (60 PostNet branches) with a `code` column but no URL-friendly slug. The customer portal has no branch awareness -- customers land on the tenant portal with no way to select a branch. Branches need their own products and pricing (already supported via `branch_capabilities` and `pricing_rules.branch_id`).

## URL Strategy

Combine both approaches: branch picker on first visit + direct branch URLs.

```text
post.document-centre.com                  --> branch picker (or default branch)
post.document-centre.com/sandton          --> direct to Sandton branch
/t/postnet                                --> branch picker
/t/postnet/sandton                        --> direct to Sandton branch
```

Once a branch is selected (via picker or URL), it's stored in `localStorage` so returning customers go straight to their branch. The branch slug appears in the URL for bookmarkability.

## Plan

### 1. Database: Add `slug` column to `branches`

Migration:
- Add `slug text` column to `branches` (nullable initially)
- Backfill from `code` (lowercase, e.g. `ARCON-PARK` -> `arcon-park`)
- Add unique constraint per tenant: `UNIQUE(tenant_id, slug)`
- Make `slug` NOT NULL after backfill

### 2. Branch Context Provider

Create a `BranchContext` that sits inside the customer portal layout:
- Resolves branch from URL param (`/:branchSlug`) or `localStorage`
- Exposes `activeBranch`, `setBranch()`, `branches[]`
- If tenant has only 1 branch, auto-select it (no picker shown)
- If tenant has multiple branches and none selected, show the picker

### 3. Customer Portal Routing

Update `App.tsx` routes to support optional branch slug:

```text
/t/:slug/:branchSlug?/*    (path-based)
/:branchSlug?/*            (subdomain-based)
```

The branch slug is optional -- if omitted, the branch picker or localStorage kicks in. When present, it resolves the branch and sets context.

### 4. Branch Picker Component

A full-page or modal picker shown when:
- Multi-branch tenant AND no branch selected AND no branch in URL

Features:
- Search/filter (important with 60+ branches)
- Shows branch name, city/suburb
- Optional: geolocation to sort by nearest
- Glassmorphic Printflow styling
- "Remember my branch" checkbox (localStorage)

### 5. Branch Indicator in Header

Once a branch is selected, show it in the customer header:
- Branch name displayed (e.g. "PostNet Sandton")
- Click to change branch (reopens picker)
- Single-branch tenants: no indicator shown

### 6. Wire Branch into Orders

When creating orders/cart items, pass the selected `branch_id` so:
- Pricing rules filter by branch
- `branch_capabilities` filter available products
- Orders are attributed to the correct branch

---

## Technical Details

### Route structure change in App.tsx

For path-based routes:
```
<Route path="/t/:slug/:branchSlug?" element={<CustomerLayout />}>
  ...existing child routes...
</Route>
```

For subdomain-based routes (when `matched`):
```
<Route path="/:branchSlug?" element={<CustomerLayout />}>
  ...existing child routes...
</Route>
```

The `branchSlug` param is extracted in `CustomerLayout` and fed into `BranchContext`.

### localStorage key

`dc_branch_{tenantId}` storing the branch slug. Cleared on sign-out.

### Files to create/modify

| File | Change |
|------|--------|
| Migration | Add `slug` to `branches`, backfill, unique constraint |
| `src/contexts/BranchContext.tsx` | New -- branch resolution and state |
| `src/components/BranchPicker.tsx` | New -- search/select UI |
| `src/components/CustomerLayout.tsx` | Wrap with `BranchContext`, show picker when needed |
| `src/components/CustomerHeader.tsx` | Branch indicator + change button |
| `src/App.tsx` | Add `:branchSlug?` to customer routes |
| `src/hooks/useCart.ts` | Pass branch_id from context |
| `src/hooks/useBranchCapabilities.ts` | Already exists, will be used by product filtering |
