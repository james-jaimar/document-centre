## Goal

A single print job = a single paper size. Today, when a user uploads multiple documents the size advisory fires per document independently — they can end up with a Letter scaled to A4, plus an A3 ISO doc, plus a Letter kept at original. That's a production hazard.

This plan introduces a **session-wide paper size lock** that's set the first time the user makes a size decision, then silently applied to every subsequent upload in the same session. A second-pass guard at the assignment step catches any edge-case mismatches.

---

## 1. Session size lock state (`OrderFiles.tsx`)

Add a `sessionSizeLock` state at the page level — lives only for the current visit to `OrderFiles` (per the user's session, as requested):

```ts
type SessionSizeLock = {
  size: PaperSize;          // { name: "A4", widthMm: 210, heightMm: 297 }
  source: "user_chose" | "first_iso_upload";
  setAtMs: number;
};
const [sessionSizeLock, setSessionSizeLock] = useState<SessionSizeLock | null>(null);
```

The lock is set in three places:

- **First non-ISO advisory resolved** → user clicks "Scale to A4" → lock = A4. User clicks "Keep original" (e.g. Letter) → lock = Letter.
- **First ISO upload that needs no advisory** → e.g. user uploads a clean A4 → lock = A4 (source: `first_iso_upload`).
- The lock persists for the page lifetime; it is NOT written to the database. A page reload resets it (deliberate — we only want to bind a single upload session).

---

## 2. Auto-apply silently in the non-ISO advisory path

In the `useEffect` that detects `nonIsoDoc` (currently lines 245–263 of `OrderFiles.tsx`):

- Before opening the modal, check `sessionSizeLock`.
- **If the lock exists**: skip the modal entirely. Call either `handleScaleTo(lock.size)` or `handleKeepOriginal()` based on the action that originally set the lock. Show a sonner toast: `"Auto-applied A4 (matches earlier choice for this upload)"`.
- **If no lock yet**: open the modal as today. When the user resolves it via `handleScaleTo` or `handleKeepOriginal`, set `sessionSizeLock` before closing.

This means: doc 1 prompts; docs 2…N just process silently with a toast each.

`handleScaleTo` and `handleKeepOriginal` already do all the heavy lifting (resize → finalise → render → DB update). We just need to extract them so they can be called with an explicit doc payload (not just `advisoryDoc` from state) — currently they read from `advisoryDoc`, so for the silent path we'll pass the queued doc directly:

```ts
const applySizeDecision = useCallback(async (doc: AdvisoryDocPayload, action: "keep" | { scaleTo: PaperSize }) => { ... });
```

`handleScaleTo` / `handleKeepOriginal` become thin wrappers that read `advisoryDoc` and delegate.

---

## 3. Extend the lock to ISO-only uploads

Even when no advisory fires (e.g. a clean A4 PDF), record the size as the lock:

- After `useDocumentUpload` reports a successful render and the doc has clean `page_width_mm/page_height_mm` matching an ISO size, run a small effect:
  - If `sessionSizeLock === null` and the doc matches an ISO size → set the lock to that ISO size with `source: "first_iso_upload"`.
  - If `sessionSizeLock` exists and the new doc's effective size **does not** match the lock → fire a new advisory modal (reuse `PaperSizeAdvisory` with a small variant prop, see §4) offering to scale this doc to the locked size, OR keep original (which clears the lock and surfaces the §5 guard later).

This handles the "user uploads A4 + A3" mixed-ISO case the user explicitly called out.

---

## 4. New "follow-the-lock" advisory variant (`PaperSizeAdvisory.tsx`)

Add an optional prop `lockedSize?: PaperSize` to `PaperSizeAdvisory`. When present:

- Headline changes to: *"Different size detected"* (amber, not red).
- Body: *"Your earlier files are A4. This file is A3 (297 × 420mm). Mixed sizes can't be printed together."*
- Primary action becomes **"Scale to A4 (match other files)"** — pre-selected.
- Secondary option: **"Keep original A3 — I'll change other files instead"** (this clears the lock; subsequent uploads will re-evaluate; existing already-resolved docs stay as-is; the §5 assignment guard will catch any leftover mismatch).

Implementation: a small conditional render block inside the existing `DialogContent`. No new file.

---

## 5. Belt-and-braces guard at section assignment (`SectionList.tsx` + `useCart.ts`)

Even with the upload-time lock, catch mismatches at assignment time:

- Compute the "active print size" = the size of the first doc already assigned to any section in this order (read `effective_width_mm`/`effective_height_mm` from `preflight_data`, fall back to `page_width_mm`/`page_height_mm`).
- When the user attempts to assign a doc whose effective size doesn't match: block the action and show a sonner `toast.error` with description: *"Mixed paper sizes can't be printed together. Re-upload this file at A4 or remove the A3 files first."*
- Surface the same warning passively in `FileList.tsx` next to the dimensions chip: a small amber `⚠ size mismatch` badge if the doc's size differs from the active print size.

This catches:
- Edge cases where the user reloaded the page (resetting the lock) and uploaded more files.
- Cloned/recently-uploaded docs being added from the dashboard.
- Files already in the system from prior sessions.

---

## 6. UX polish

- **Lock indicator**: small chip near the upload button: *"Locked to A4 for this session · Reset"*. Reset clears `sessionSizeLock` (advisories will start prompting again). Helpful escape hatch for power users.
- **Toast copy** for silent auto-apply: `"Auto-scaled to A4 to match other files"` (success, 4s) or `"Kept Letter size to match other files"` (info, 4s).
- **Empty state**: if there are zero documents yet, no lock indicator is shown — the lock only appears after the first decision.

---

## Files to modify

- `src/pages/dashboard/OrderFiles.tsx` — session lock state, auto-apply effect, ISO-clean detection effect, lock indicator chip.
- `src/components/order/PaperSizeAdvisory.tsx` — `lockedSize` variant prop and the alternate copy/buttons.
- `src/components/order/SectionList.tsx` — assignment-time mismatch guard.
- `src/components/order/FileList.tsx` — passive `⚠ size mismatch` badge.
- `src/hooks/useCart.ts` — only if the assignment mutation needs to refuse mismatches server-side as well; otherwise UI guard only.

## Out of scope

- No DB schema changes — the lock is purely client-side per page session, matching the user's "for that session" wording.
- No changes to the bleed advisory or orientation advisory flows; those remain independent.
- No retroactive resizing of already-resolved documents when the user later changes their mind — they must remove + re-upload (with a clear toast directing them to do so).