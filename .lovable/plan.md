## Goal

Fix the false negative in `verify-imposition-stack.sh` so `document-centre-api.service` is correctly reported as installed/active. The unit IS installed and running on the VPS (`systemctl list-units` confirms it); the verify script's detection just uses a fragile primitive.

## Root cause

The current check:

```bash
if ! systemctl list-unit-files "$unit" >/dev/null 2>&1 \
     || ! systemctl list-unit-files | grep -q "^${unit}"; then
  row_fail "$unit" "unit file not installed"
  return
fi
```

…depends on `list-unit-files` column alignment and exit codes that vary by systemd version and by whether the unit file is a regular file, symlink, drop-in, or transient. On `srv1516161` the API unit is detected fine by `systemctl list-units` and `systemctl is-active` but slips past this `list-unit-files` grep — causing FAIL despite the service being healthy.

## Fix

Replace the unit-file-existence check with `systemctl cat "$unit" >/dev/null 2>&1`, which returns 0 whenever systemd can resolve the unit file (regardless of where it lives or how it's linked). Then keep the existing `is-active` + `SubState` reporting.

```bash
check_unit() {
  local unit="$1"
  if ! command -v systemctl >/dev/null 2>&1; then
    row_fail "$unit" "systemctl not available"; return
  fi
  if ! systemctl cat "$unit" >/dev/null 2>&1; then
    row_fail "$unit" "unit file not installed"
    return
  fi
  local state sub
  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  sub="$(systemctl show -p SubState --value "$unit" 2>/dev/null || true)"
  if [[ "$state" == "active" ]]; then
    row_pass "$unit" "active ($sub)"
  else
    row_fail "$unit" "$state ($sub)"
  fi
}
```

## Re-verify

Expected after the fix on the VPS:

```
[SYSTEMD UNITS]
  PASS  redis-server.service                    active (running)
  PASS  document-centre-api.service             active (running)
  PASS  document-centre-worker-heavy.service    active (running)
  PASS  document-centre-worker-light.service    active (running)
  PASS  document-centre-beat.service            active (running)

== Summary: 28/28 PASS, 0 FAIL ==
```

## Files touched

- `pdf-server/scripts/verify-imposition-stack.sh` — replace the `check_unit` body's existence test with `systemctl cat`.

No other files change.

## Out of scope (flagging only)

The running uvicorn process on the VPS is `--host 127.0.0.1 --port 8000` with no `--workers 3 --proxy-headers --forwarded-allow-ips=* --timeout-keep-alive 30`, while the repo's `deploy/systemd/document-centre-api.service` specifies all of those. That suggests the installed unit on `srv1516161` is an older/edited copy. Worth a follow-up `sudo systemctl cat document-centre-api.service` and a `cmp` against the repo file — but that's a separate cleanup, not part of this fix.
