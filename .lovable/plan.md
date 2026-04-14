

## Fix: "Save & Leave" doesn't persist draft as visible order

### Problem
When the user clicks "Back to Files" and chooses "Save & Leave" with a reference name, the `handleSaveAndLeave` function saves the spec and title but leaves `build_status` as `'draft'`. The recent change to CustomerOrders filters out orders where all items have `build_status: 'draft'`, so the saved order becomes invisible.

### Fix

**`src/pages/dashboard/OrderBuild.tsx`** — In `handleSaveAndLeave` (line ~485), after updating the title, also set `build_status: 'building'` on the order item. This marks the item as actively worked on, making it visible in the orders list and the "Recently Modified" dashboard section.

```typescript
await supabase
  .from("order_items")
  .update({ title: ref.trim() || null, build_status: "building" } as any)
  .eq("id", orderItem.id);
```

This is a one-line addition to the existing update call. The `'building'` status correctly represents "user has started configuring this item and explicitly saved progress."

### Result
- Orders saved via "Save & Leave" appear in the orders list and dashboard
- Unsaved preview-only drafts (never explicitly saved) remain hidden
- The "Continue" button routes correctly since `'building'` maps to Step 1 (File Management)

