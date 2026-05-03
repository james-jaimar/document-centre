## Problem

AWS Amplify builds with `npm ci`, which requires `package-lock.json` to be in sync with `package.json`. The recent addition of `react-pdf` was done via `bun add`, which only updates `bun.lockb` — leaving `package-lock.json` stale.

## Fix

Run `npm install --package-lock-only` to regenerate `package-lock.json` without modifying `node_modules`. This brings it in sync with the current `package.json` (including `react-pdf`).

No code changes needed — just a lockfile regeneration.
