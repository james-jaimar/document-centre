

## Problem

The paper size advisory modal appears twice because of a race condition:

1. User clicks "Scale to A5" (or "Keep Original")
2. Handler writes `size_resolved: true` to the database, then calls `setAdvisoryDoc(null)` and `refetchDocuments()`
3. The `refetchDocuments()` call can return before the DB write fully propagates, so the `useEffect` sees the same document still lacking `size_resolved: true` and re-opens the modal

## Fix

**File: `src/pages/dashboard/OrderFiles.tsx`**

Track resolved document IDs locally so the `useEffect` never re-triggers for the same document:

1. Add a `useRef<Set<string>>` called `resolvedDocIds` to track IDs that have been handled
2. In `handleKeepOriginal` and `handleScaleTo`, add the doc ID to the set before clearing `advisoryDoc`
3. In the `useEffect` that detects non-ISO docs, skip any document whose ID is in `resolvedDocIds`

This is a one-file, ~6-line change that eliminates the race without changing any other behavior.

