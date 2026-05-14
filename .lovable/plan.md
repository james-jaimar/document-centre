## Goal

Resolve the two failures from `verify-imposition-stack.sh` so the stack is fully green before we move on to imposition UI/backend work. Both are easy wins.

---

## 1. Fix CMYK profile detection in the verify script (false negative)

`pdf-server/scripts/verify-imposition-stack.sh` currently looks for CMYK profiles with:

```bash
find "$ICC_DIR" -type f \( -iname '*fogra*.icc' -o -iname '*fogra*.icm' -o -iname '*cmyk*.icc' \)
```

The ECI/PSO profiles are installed but their filenames are `ISOcoated_v2_eci.icc`, `ISOcoated_v2_300_eci.icc`, `PSOcoated_v3.icc` — none contain `fogra` or `cmyk`. Verified on the VPS:

```
ISOcoated_v2_300_eci.icc  ISOcoated_v2_eci.icc  PSOcoated_v3.icc  sRGB_v4_ICC_preference.icc
```

These are exactly the four canonical names that `install-icc-profiles.sh` and `app/services/icc_profiles.py` (`PROFILE_MAP`) already reference — so the source of truth should be those filenames, not a fuzzy grep.

**Change:** replace the fuzzy `find` with explicit checks for the four canonical filenames defined in `PROFILE_MAP` (sRGB, ISOcoated v2, ISOcoated v2 300, PSOcoated v3). Each shows PASS/FAIL with the exact path. Keep the "total ICC files" line for context.

While there, also fix the `qrcode` version probe — `qrcode` exposes `qrcode.__version__` in newer releases but the package's top-level may not in 7.4.2; fall back to `importlib.metadata.version("qrcode")` so we get `7.4.2` instead of `?`. Apply the same fallback to every package check (cleaner across the board).

## 2. Install the missing `document-centre-worker-light.service` on the VPS

The unit file exists in the repo at `pdf-server/deploy/systemd/document-centre-worker-light.service` but was never copied into `/etc/systemd/system` on `srv1516161`. Heavy is running, light is absent — meaning thumbnail / default-queue jobs are currently NOT being consumed by a dedicated worker.

The repo already ships an idempotent migrator that does exactly this: `pdf-server/scripts/migrate-to-split-workers.sh`. It:

1. Stops + disables the legacy single-pool `document-centre-worker.service` if present.
2. Copies both heavy + light unit files from `deploy/systemd/` into `/etc/systemd/system/`.
3. `daemon-reload`, then `enable --now` both units.
4. Runs `celery inspect active_queues` to prove both workers are alive.

**Action:** no code change needed — user runs on the VPS:

```bash
sudo bash /opt/document-centre-api/scripts/migrate-to-split-workers.sh
```

then re-runs `verify-imposition-stack.sh`.

## 3. Re-verify

Expected result after both fixes:

```
[ICC PROFILES]
  PASS  sRGB                 .../sRGB_v4_ICC_preference.icc
  PASS  ISOcoated v2         .../ISOcoated_v2_eci.icc
  PASS  ISOcoated v2 (300)   .../ISOcoated_v2_300_eci.icc
  PASS  PSOcoated v3         .../PSOcoated_v3.icc

[PYTHON PACKAGES]
  ... PASS  qrcode  7.4.2

[SYSTEMD UNITS]
  PASS  document-centre-worker-light.service  active (running)

== Summary: 27/27 PASS, 0 FAIL ==
```

---

## Files touched

- `pdf-server/scripts/verify-imposition-stack.sh` — replace ICC section with explicit canonical-filename checks; add `importlib.metadata.version()` fallback in `check_pkg`.

No other files change. After this, the stack is fully verified and we can return to the imposition admin UI / per-product defaults work.
