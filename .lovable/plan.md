

# Plan: Enhance Users & Roles + Branch Detail Pages

## Problem

1. **AdminUsers page exists but has no "Add User" button** — only edit/delete. No way to invite or create new tenant members from the UI.
2. **Branch detail is too thin** — just a card with address/phone. A franchise model (e.g. PostNet) needs each branch to show its own users, contact person, operational settings, and capabilities.
3. **No branch-level user management** — the current users page shows all tenant members but doesn't support filtering by branch or managing branch-specific staff.

## What we will build

### 1. Add "Invite/Add Member" to AdminUsers

- Add an "Add Member" button that opens a dialog
- Fields: email (to look up existing profile or invite), role selector, branch assignment, permissions toggles
- Uses `useCreateTenantMember` mutation (already exists)
- For v1: only assign existing profiles (by email lookup from profiles table). Invite flow can come later.

### 2. Expand Branch Detail into a dedicated page

Replace the simple card grid with a **clickable branch list** that navigates to `/admin/branches/:id` — a detail page with tabs:

- **Details** — name, code, address, contact person, email, phone, pickup/dispatch settings, active toggle (the current edit form, but inline)
- **Users** — filtered list of `tenant_memberships` where `branch_id` matches; ability to assign/remove users to this branch
- **Capabilities** — links to existing `branch_capabilities` table (product families this branch can handle, turnaround, min/max pages)

### 3. Branch Users sub-view

- On the branch detail page, show members assigned to that branch
- Allow assigning existing tenant members to the branch (change their `branch_id`)
- Allow creating new members directly assigned to this branch

## Files to create

- `src/pages/admin/AdminBranchDetail.tsx` — tabbed branch detail page (Details, Users, Capabilities)

## Files to modify

- `src/pages/admin/AdminBranches.tsx` — make branch cards clickable, navigate to `/admin/branches/:id`
- `src/pages/admin/AdminUsers.tsx` — add "Add Member" dialog with email lookup + role + branch assignment
- `src/App.tsx` — add route `/admin/branches/:id` pointing to `AdminBranchDetail`

## Technical details

### AdminUsers "Add Member" flow
- Input: email field that searches `profiles` table
- On match: show profile name, let admin pick role + branch + permissions
- On no match: show message "User not found — they need to sign up first" (invite flow is v2)
- Uses existing `useCreateTenantMember` hook

### AdminBranchDetail tabs
- **Details tab**: inline editable form (reuse existing form fields from AdminBranches dialog), plus new fields: `contact_person`, pickup allowed toggle, dispatch origin toggle. These can use the existing `settings` JSONB column on branches.
- **Users tab**: query `useTenantMembers` filtered client-side by `branch_id`, with "Assign User" button to move existing tenant members to this branch
- **Capabilities tab**: query `branch_capabilities` filtered by `branch_id`, display product family capabilities (read-only for now, CRUD in v2)

### Route addition
```
/admin/branches/:id → AdminBranchDetail
```

### No database changes needed
- `branches` table already has `settings` JSONB for extensible config
- `tenant_memberships` already has `branch_id` column
- `branch_capabilities` table already exists

## Implementation order
1. Add "Add Member" dialog to AdminUsers
2. Create AdminBranchDetail page with 3 tabs
3. Update AdminBranches to link to detail page
4. Add route in App.tsx

