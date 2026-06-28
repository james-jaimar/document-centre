## Problem

Amplify's `npm ci` is failing with `EUSAGE — Missing: ... from lock file` for ~25 transitive dependencies (archiver-utils, compress-commons, crc32-stream, glob, mkdirp, rimraf, etc.). These are all transitive deps of `exceljs` / `archiver`, which were pulled in for the new branch Reports Excel export.

`npm ci` requires `package.json` and `package-lock.json` to be perfectly in sync. The recent install was done with bun (which updated `bun.lockb`), but `package-lock.json` was never regenerated — so npm sees package.json declaring deps whose transitive tree is not represented in the lockfile, and refuses to install.

## Fix

Regenerate `package-lock.json` so it matches the current `package.json` (and the bun lockfile state), then commit it. The Amplify build will then succeed on the next deploy.

Steps:

1. Run `npm install --package-lock-only --ignore-scripts` at the project root to rebuild `package-lock.json` from `package.json` without touching `node_modules` or running postinstall scripts.
2. Verify with `npm ci --dry-run` that there are no more "Missing from lock file" errors.
3. Leave `bun.lockb` untouched — it stays as the local dev lockfile; Amplify uses npm.

No application code, no Amplify config, no dependency versions change. Only `package-lock.json` is regenerated.

## Why not switch Amplify to bun

Switching the Amplify install command to `bun install` would also fix it, but it's a bigger change (build image, cache key, lockfile-of-record) and we don't need it — keeping npm as the CI installer and just refreshing the lockfile is the minimal, safe fix.
