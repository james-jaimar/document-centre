I found the cause of the loop: `upload_sessions.order_item_id` was created with a foreign key to `order_jobs(id)`, but Photo Prints is passing an `order_items.id`. The database rejects every QR session insert with `409 Conflict`, and the modal keeps trying to create the session again because no session is ever created.

Plan:

1. Fix the database constraint
   - Add a migration that changes `upload_sessions.order_item_id` to reference `public.order_items(id)` instead of `public.order_jobs(id)`.
   - Keep cascade delete behavior so temporary upload sessions are cleaned up when an order item is removed.

2. Stop the retry loop in the UI
   - Update `useUploadSession` to track a session creation error and prevent repeated automatic retries while the modal remains open.
   - Return the error state to the modal.

3. Show a clear failure message in the QR modal
   - If session creation fails, show a visible error such as “Could not generate upload link. Please close and try again.” instead of staying on an infinite spinner/loop.
   - Add a retry action that attempts session creation once when clicked.

4. Check the Photo Prints flow after the fix
   - Confirm clicking “Upload from Phone” creates the lazy order item, opens the QR modal, and generates the QR link without console spam.
   - Confirm the QR URL still points to `/upload/:token` and the mobile upload edge function continues to save files against `documents.order_item_id`.

Technical details:

```sql
ALTER TABLE public.upload_sessions
  DROP CONSTRAINT IF EXISTS upload_sessions_order_item_id_fkey;

ALTER TABLE public.upload_sessions
  ADD CONSTRAINT upload_sessions_order_item_id_fkey
  FOREIGN KEY (order_item_id)
  REFERENCES public.order_items(id)
  ON DELETE CASCADE;
```

This matches the rest of the app: `documents.order_item_id` already references `order_items(id)`, and the Photo Prints builder uses `order_items` throughout.