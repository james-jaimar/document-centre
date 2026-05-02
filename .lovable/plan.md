
## Problem

AWS Amplify builds with `npm ci`, which requires `package-lock.json` to be in sync with `package.json`. The recent addition of `qrcode.react` updated `package.json` and `bun.lock` but not `package-lock.json`, causing the last 4 deployments to fail.

## Fix

Run `npm install` in the project to regenerate `package-lock.json` so it includes all current dependencies (including `qrcode.react`). This is a single command — no code changes needed.

## Technical detail

- Lovable uses `bun` locally, which maintains `bun.lock` but does not update `package-lock.json`.
- Every time a new dependency is added via `bun add`, the `package-lock.json` drifts out of sync.
- Running `npm install` will regenerate `package-lock.json` from the current `package.json`, restoring sync.
