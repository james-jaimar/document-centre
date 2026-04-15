-- Step 1: Delete document_sections tied to draft/cart order items
DELETE FROM document_sections
WHERE order_item_id IN (
  SELECT oi.id FROM order_items oi
  WHERE oi.order_id IN (SELECT id FROM orders WHERE order_status IN ('cart', 'draft'))
);

-- Step 2: Delete documents tied to draft/cart order items
DELETE FROM documents
WHERE order_item_id IN (
  SELECT oi.id FROM order_items oi
  WHERE oi.order_id IN (SELECT id FROM orders WHERE order_status IN ('cart', 'draft'))
);

-- Step 3: Delete order_addresses tied to draft/cart orders
DELETE FROM order_addresses
WHERE order_id IN (SELECT id FROM orders WHERE order_status IN ('cart', 'draft'));

-- Step 4: Delete order items tied to draft/cart orders
DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE order_status IN ('cart', 'draft'));

-- Step 5: Delete the draft/cart orders themselves
DELETE FROM orders
WHERE order_status IN ('cart', 'draft');