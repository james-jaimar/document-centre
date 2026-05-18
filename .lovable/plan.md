## Goal

Make the **Photo Prints** flow on Document Centre (used by demos and PostNet) genuinely usable on a phone — matching the mobile UX from the **Print My Pics** project — without touching the desktop experience that already works.

Scope is intentionally narrow: only the customer-facing **photo print builder** (`PhotoPrintsBuilder.tsx`). Other product flows (PDFs, brochures, bound docs) are out of scope; they'll continue to use the existing desktop-style page on mobile, as today.

## What Print My Pics does well on mobile (and we don't)

1. **Device-aware UI**, not just a responsive squeeze — detects coarse pointer + touch + narrow viewport, then renders a completely different upload section.
2. **Two huge full-width buttons** instead of a tiny drag-drop zone:
   - **Choose photos** → opens the phone's photo library (`<input type=file multiple>`)
   - **Take a photo** → opens the camera directly (`capture="environment"`)
3. **No QR card on mobile** — the user IS the phone; the QR is desktop-only.
4. **Big animated sticky upload banner** at the top during uploads so customers don't tap away mid-upload ("Uploading 2 of 5 photos…").
5. **HEIC → JPEG conversion** in-browser via `heic2any` so iPhone photos actually upload.
6. **2-column grid for size pickers**, full-width sticky bottom bar with safe-area padding.

## Changes

### 1. New hook — `src/hooks/useDeviceKind.ts`
Port verbatim from Print My Pics: returns `"mobile" | "desktop"` based on `pointer:coarse` + `maxTouchPoints` + `innerWidth < 900`. We deliberately don't reuse `useIsMobile` (pure 768px breakpoint) because it misclassifies tablets and is too blunt for this flow.

### 2. New component — `src/components/photo/MobileUploadBanner.tsx`
Ported from Print My Pics. Sticky, animated coral banner showing "Uploading N of M…" with a shimmer bar, then a brief success state. Driven by `{ uploadingCount, totalCount }` props.

### 3. HEIC support in `src/hooks/usePhotoUpload.ts`
Add `heic2any` conversion step before `readImageDimensions` / S3 upload. Detect by MIME (`image/heic`, `image/heif`) or extension. Install `heic2any` as a dependency. Keeps desktop behaviour identical for non-HEIC files.

### 4. `src/pages/dashboard/PhotoPrintsBuilder.tsx` — mobile branch
- Import and use `useDeviceKind`.
- Track a small `uploadBatch` state `{ uploading, total }` and feed `MobileUploadBanner` at the top of the page.
- When `device === "mobile"`:
  - Replace the `<PhotoUploader>` drag-drop zone (and the post-upload "drag more here" strip) with two full-width buttons: **Choose photos** (library) and **Take a photo** (camera). Hidden file inputs, native pickers, no QR.
  - Render size pickers as a 2-column tap-friendly grid (existing `<Select>` controls stay for desktop).
  - Sticky bottom "Add to cart" bar uses `pb-[max(0.75rem,env(safe-area-inset-bottom))]` for iPhone safe area.
- When `device === "desktop"`: render exactly what's there today — no regressions.

### 5. No backend/schema changes
Existing `usePhotoUpload` → `documents` table → S3 pipeline is untouched. Only the client-side UI and the HEIC pre-processing change.

## Out of scope (call out explicitly)

- Mobile UX for non-photo product flows (bound documents, brochures, etc.) — those will be addressed separately if/when the customer asks.
- Admin/branch portals — desktop only stays as-is.
- Tenant branding — banner uses existing semantic tokens (`bg-primary`, `text-primary-foreground`).

## Verification

- Desktop preview at current viewport (1109×715): page looks identical to today.
- Mobile preview (≤900px wide + touch emulation): two big buttons replace the drop zone, banner appears during upload, sticky cart bar respects safe area.
- Upload an iPhone HEIC via "Choose photos" on mobile → converts to JPEG → renders as a tile → adds to cart.
- Upload a JPEG on desktop → unchanged behaviour.
