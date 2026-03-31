

# Ecommerce Order Management Engine — Build Plan

## Overview
Evolve the existing database and adopt the PrintJob tenant_memberships role system to build a full multi-tenant, multi-app order management engine with admin grids, customer views, messaging, timeline, payments, proofs, and documents.

## Phased Approach

This is a large build. We will execute in 6 phases, saving a build file (`.lovable/plan.md`) that tracks progress.

---

## Phase 1: Database Schema Evolution

**Goal:** Evolve existing tables and add new ones to match the PrintJob schema.

### Existing tables to ALTER:
- **`tenants`** — add `app_id` (nullable initially, backfill later), `external_ref`, drop `logo_url`/`settings` or keep alongside
- **`branches`** — add `code`, `external_ref`; keep existing address fields
- **`profiles`** — add `email`, `first_name`, `last_name`, `phone`, `global_role` (text, default 'customer'), `is_active`
- **`orders`** — add all new columns: `app_id`, `order_number`, `external_order_ref`, `source_channel`, `storefront_name`, `ordered_by_profile_id`, `customer_email`, `customer_name`, `company_name`, `admin_status`, `customer_status`, `payment_status`, `fulfilment_status`, financial columns (`subtotal`, `discount_amount`, `delivery_amount`, `vat_amount`, `total_amount`, `amount_paid`, `amount_due`, `currency`), `date_required`, `turnaround_time_text`, `notes_internal`, `notes_customer`, `metadata`, `submitted_at`, `completed_at`
- **`documents`** — add `app_id`, `tenant_id`, `branch_id`, `order_id` (nullable FK to new orders), `job_id`, `document_type`, `title`, `storage_bucket`, `public_url`, `version_no`, `is_customer_visible`, `source_app_managed`, `created_by`

### New tables to CREATE:
- **`apps`** — multi-app registry
- **`tenant_memberships`** — replaces `user_roles` for order-engine permissions
- **`suppliers`** — outsource supplier registry
- **`number_sequences`** — auto-incrementing order/job numbers per app
- **`order_jobs`** — individual jobs within an order (multi-job orders)
- **`order_addresses`** — billing/delivery addresses per order
- **`order_pricing_snapshots`** — immutable pricing history
- **`payments`** — payment events linked to orders
- **`timeline_events`** — audit trail with admin/customer visibility
- **`messages`** — threaded messaging per order/job
- **`job_proofs`** — proof management per job
- **`status_history`** — status change audit log

### New functions:
- `set_updated_at()` trigger function (already exists as `update_updated_at_column`)
- `next_number()`, `generate_order_number()`, `generate_job_number()`
- `map_customer_job_status()`, `rollup_order_status()`, `sync_order_amounts()`
- `handle_order_jobs_after_write()` trigger
- `user_has_membership()`, `user_is_staff_for()`, `user_can_read_order()`

### New RLS policies:
All policies from `002_rls.sql` — using the new membership-based security definer functions.

### Migration strategy:
- Will be split into 2-3 migrations to keep each manageable
- Keep existing `user_roles` table for backward compatibility during transition
- Old `order_status` enum and related fields remain until fully migrated

---

## Phase 2: Edge Functions for Mutations

**Goal:** Server-side actions for order creation and workflow mutations (as specified — no client-side inserts into order trees).

### Edge functions to create:
- **`order-engine`** — single edge function with action routing:
  - `createOrderWithJobs` — creates order + jobs + addresses + pricing snapshot + timeline event
  - `updateJobStatus` — updates job status, records status_history, triggers rollup
  - `recordPaymentEvent` — inserts payment, updates order amounts
  - `attachOrderDocument` — inserts document record
  - `createJobProof` — creates proof record, updates job proof_status
  - `sendMessage` — inserts message + timeline event

---

## Phase 3: Shared Library Layer

**Goal:** TypeScript types, queries, mutations, and status maps.

### Files:
- **`src/lib/orders/types.ts`** — TypeScript interfaces from `printjob.types.ts`
- **`src/lib/orders/queries.ts`** — Supabase queries for admin and customer order lists
- **`src/lib/orders/mutations.ts`** — Edge function callers
- **`src/lib/orders/status-maps.ts`** — Status labels, colors, icons for admin and customer statuses
- **`src/hooks/useOrders.ts`** — React Query hooks for order data
- **`src/hooks/useOrderDetail.ts`** — Single order with jobs, timeline, messages

---

## Phase 4: Admin Order Management UI

**Goal:** Dense operational views for staff.

### Pages:
- **`/admin/orders`** — Order Manager grid
  - Search, status filter chips, configurable columns, pagination
  - Columns: job#, order#, source, company/customer, date, product, quantity, gross price, payment status, ready status, messages count, urgency
  - Row click → order detail

- **`/admin/orders/:id`** — Order Detail (3-column desktop)
  - Left: order summary + job list
  - Center: selected job details (rendered from `configuration.summary` + `configuration.sections`), pricing, documents/actions
  - Right: timeline + messaging panel
  - Tabs: Summary, Pricing, Delivery, Ordered By, Documents, Messages
  - Actions: status updates, supplier assignment, proof actions, payment actions

### Components:
- `OrderManagerGrid`, `OrderFilters`, `OrderStatusChips`
- `OrderDetailLayout`, `JobCard`, `JobConfigRenderer`
- `TimelinePanel`, `MessageThread`, `MessageComposer`
- `PricingSummary`, `PaymentActions`, `ProofActions`
- `DocumentList`, `AddressCard`

---

## Phase 5: Customer Order Views

**Goal:** Customer-facing order list and detail.

### Pages:
- **`/dashboard/orders`** — Enhanced order list with status tabs
  - Tabs: Awaiting Payment, In Production, Proof Pending, On Hold, Completed, Cancelled, All Orders
  - Columns: order/job#, date, product, quantity, gross price, payment status, proof, track

- **`/dashboard/orders/:id`** — Order Detail (2-column)
  - Main: order/job details (rendered from configuration JSON)
  - Side: customer-safe timeline + messaging
  - Tabs: Job List, Pricing, Delivery, Documents
  - Only shows `is_customer_visible` documents
  - Only shows timeline events with visibility `customer` or `both`
  - Cannot see internal messages

---

## Phase 6: Polish and Integration

- Connect existing document upload flow to order_jobs
- Wire up the existing product configurator to create orders via edge function
- Proof approval flow (approve/reject from customer side)
- Payment integration hookpoints (PayFast/Stripe/manual)
- Responsive behavior for all new pages
- Sidebar navigation updates for new routes

---

## Key Design Decisions

1. **App-agnostic:** Product details render from JSON (`configuration.summary`, `configuration.sections`), never hardcoded
2. **Multi-app:** The `apps` table allows different source applications (packaging, labels, document centre) to feed into the same engine
3. **Dual status:** Separate `admin_status` and `customer_status` on orders and jobs — customers see a simplified view
4. **Immutable snapshots:** `product_snapshot` on jobs and `order_pricing_snapshots` preserve history
5. **Server-side mutations:** All order creation and status changes go through edge functions using service role
6. **Existing tables preserved:** Current functionality continues working while new system is built alongside

## Execution
We will implement phase by phase, starting with Phase 1 (database migrations). Each phase will be tracked in `.lovable/plan.md`.

