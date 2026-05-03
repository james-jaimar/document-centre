
## Two Issues

### 1. Why sRGB Profile is Referenced (Not a Bug)

The sRGB profile is used as the **input source profile** for Ghostscript's RGB-to-CMYK conversion — it is NOT an output profile. Here's how it works:

When a customer uploads an RGB document (which most Word/PowerPoint files are), Ghostscript needs to know what RGB colour space the source uses so it can accurately convert to the CMYK destination profile (Fogra 39/51). The `-sDefaultRGBProfile=sRGB` flag tells Ghostscript: "interpret any untagged RGB colours as sRGB". The `-sDefaultCMYKProfile=fogra39` flag tells it where to convert TO.

Without the sRGB source profile, Ghostscript would guess the input colour space and produce inaccurate CMYK conversions. This is standard ICC colour management practice.

**The actual error** is that the `sRGB_v4_ICC_preference.icc` file simply hasn't been installed on the VPS yet. Run on your server:
```bash
sudo bash /opt/document-centre-api/scripts/install-icc-profiles.sh
```

The Ghostscript command has a 3-attempt fallback ladder. Even if attempts 1 and 2 fail (missing ICC files), attempt 3 uses Ghostscript's built-in CMYK conversion without external profiles. So the print-ready task should have fallen through to attempt 3 rather than failing outright. Let me check if the fallback is actually being reached — it may be that the `resolve_profile("srgb")` call raises a `FileNotFoundError` BEFORE the Ghostscript command is even built, which would skip ALL attempts including the profile-free fallback.

**Code fix needed**: Move the `resolve_profile("srgb")` call inside a try/except so that when the sRGB file is missing, the code falls through to the built-in CMYK attempt (attempt 3) which doesn't need any ICC files.

### 2. Loose Sheets Orientation Normalization

Add `"stapled-loose-pages"` to the `PORTRAIT_REQUIRED` set in `orientationPolicy.ts`. This makes the upload pipeline auto-rotate any landscape pages to portrait for loose sheets — matching the behaviour of bound documents.

---

## Proposed Changes

### File 1: `src/lib/orders/orientationPolicy.ts`
Add loose sheets slug to portrait-required set:
```ts
const PORTRAIT_REQUIRED = new Set<string>([
  "bound-documents",
  "bound_documents",
  "ring-binders",
  "ring_binders",
  "booklets",
  "stapled-loose-pages",
  "stapled_loose_pages",
]);
```

### File 2: `pdf-server/app/services/pdf_ops.py` (~line 1247)
Wrap the `resolve_profile("srgb")` call so that a missing sRGB file doesn't prevent the profile-free fallback (attempt 3) from running. Currently `resolve_profile` raises `FileNotFoundError` which bubbles up and kills the entire print-ready task before any Ghostscript attempt is made.

Move the ICC-dependent attempts behind a guard:
- If `resolve_profile("srgb")` raises, skip attempts 1 and 2 (which need the RGB profile) and go straight to attempt 3 (built-in CMYK, no external profiles needed).
- Log a warning so you know the ICC profiles aren't installed.

This makes the print-ready pipeline resilient on the VPS even before you install the ICC profiles.
