
# Ecommerce Order Management Engine — Build Progress

## Phase 1: Database Schema Evolution ✅ COMPLETE

### Completed:
- Created `apps`, `tenant_memberships`, `suppliers`, `number_sequences` tables
- Created `order_jobs`, `order_addresses`, `order_pricing_snapshots` tables
- Created `payments`, `order_documents`, `timeline_events`, `messages` tables
- Created `job_proofs`, `status_history` tables
- ALTERed `tenants` (added app_id, external_ref)
- ALTERed `branches` (added code, external_ref)
- ALTERed `profiles` (added email, first_name, last_name, phone, global_role, is_active)
- ALTERed `orders` (added all financial, status, and metadata columns)
- Created all functions: next_number, generate_order_number, generate_job_number, map_customer_job_status, rollup_order_status, sync_order_amounts, handle_order_jobs_after_write
- Created membership security functions: user_has_membership, user_is_staff_for, user_can_read_order
- Enabled RLS on all new tables with full policy set
- Created triggers for order_jobs after insert/update
- Created all indexes

### Design decisions:
- Kept existing `documents` table for file upload/processing pipeline
- Created separate `order_documents` table for order engine documents (invoices, proofs, etc.)
- Kept existing `user_roles` table for backward compatibility
- New `tenant_memberships` table handles order-engine permissions
- Orders table keeps both old `order_status` enum column and new text status columns

### Client types created:
- `src/lib/orders/types.ts` — Full TypeScript type definitions
- `src/lib/orders/status-maps.ts` — Status labels, colors for all status types

---

## Phase 2: Edge Functions for Mutations ✅ COMPLETE

### Edge function: `order-engine`
- [x] createOrderWithJobs
- [x] updateJobStatus
- [x] recordPaymentEvent
- [x] attachOrderDocument
- [x] createJobProof
- [x] sendMessage

---

## Phase 3: Shared Library Layer ✅ COMPLETE (partial — hooks in Phase 4)

- [x] `src/lib/orders/types.ts`
- [x] `src/lib/orders/status-maps.ts`
- [x] `src/lib/orders/queries.ts`
- [x] `src/lib/orders/mutations.ts`
- [ ] `src/hooks/useOrders.ts` — will create with Phase 4 UI
- [ ] `src/hooks/useOrderDetail.ts` — will create with Phase 4 UI

---

## Phase 4: Admin Order Management UI ✅ COMPLETE

- [x] `/admin/orders` — Order Manager grid with search, status chips, dense table, pagination
- [x] `/admin/orders/:id` — Order Detail (3-column: summary/pricing/delivery/ordered-by tabs + job detail + timeline/messaging)
- [x] Components: OrderStatusChips, StatusBadge, OrderSummaryTab, OrderPricingTab, OrderDeliveryTab, OrderedByTab, JobDetailPanel, TimelinePanel
- [x] React Query hooks: useAdminOrders, useCustomerOrders, useOrderDetail
- [x] Routes added to App.tsx
- [x] Sidebar navigation updated with "Order Manager" link

---

## Phase 5: Customer Order Views — TODO

- [ ] `/dashboard/orders` — Enhanced order list
- [ ] `/dashboard/orders/:id` — Order Detail (2-column)

---

## Phase 6: Polish and Integration — TODO

- [ ] Connect document upload flow
- [ ] Wire product configurator
- [ ] Proof approval flow
- [ ] Payment integration hookpoints
- [ ] Responsive behavior
- [ ] Sidebar navigation updates
