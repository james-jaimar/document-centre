# Quote PDF/Email Fix + Customer Edit Discussion

## Part 1 — Bug: Download PDF and Email me a copy don't work

### Root cause
Both `quote-pdf` and `send-quote-email` edge functions use a PostgREST embedded join:

```ts
.select("*, quote_items(*), tenants:tenant_id(name, slug)")
```

PostgREST can't resolve `tenants:tenant_id(...)` because there is no declared FK from `quotes.tenant_id → tenants.id` in the schema cache. The function returns `404 "Could not find a relationship between 'quotes' and 'tenant_id'"`, so no PDF is ever generated and the email never sends. (Confirmed by direct curl to `/quote-pdf`.)

### Fix
Drop the embedded join and fetch the tenant in a second query (or use the explicit FK name if one exists). Apply to both functions:

- `supabase/functions/quote-pdf/index.ts` — replace the join with a second `supabase.from("tenants").select("name, slug").eq("id", q.tenant_id).maybeSingle()` (currently tenant name isn't even used in the PDF body, so we can simply remove it there).
- `supabase/functions/send-quote-email/index.ts` — same pattern; `tenantName` is used in the subject/body, so fetch it separately.

No schema changes. No client changes.

### Verification
1. Curl `/quote-pdf` with a real `quote_id` → expect `{ success: true, storage_path: ... }`.
2. In the UI: open Q-00002, click **Download PDF** → PDF opens in a new tab.
3. Click **Email me a copy** → toast success, check `email_send_log` for a `sent` row, recipient inbox receives mail with download link.

---

## Part 2 — Should customers be allowed to edit a quote?

My recommendation: **no full edit, but yes to a "Reactivate to cart" path** (which already exists via `useReactivateQuote`). Reasons:

- A quote is a priced offer at a point in time. Letting customers mutate line items / quantities / specs in place would invalidate the snapshot, the quote number, the validity window, and any tenant-side approval.
- The existing flow already handles the real use case: customer clicks **Add to Cart** → source order is cloned into a fresh cart → customer edits there → checks out. The original quote is marked `converted`. This preserves an audit trail.
- If they want changes *before* converting, the right action is "request revised quote" — i.e. message the tenant, who issues a new quote. We can add that later as a button if you want.

If you disagree and want true in-place edit, the cleanest scope would be: only while `quote_status = 'active'`, only quantity edits (not specs), and the quote auto-recalculates `total_amount` + writes a revision row. Happy to plan that as a follow-up.

**Out of scope here:** any quote-editing UI. This plan only ships the PDF/email fix; the edit question is for you to decide.
