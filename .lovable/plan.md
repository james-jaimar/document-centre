## Automated Artifact Registry Cleanup

### Problem
~70 Docker images have accumulated in ~10 days of heavy iteration. Artifact Registry is costing £3.12/mo and growing. The user wants to keep only a 5-image rollback buffer.

### Files to Change

1. **`.github/workflows/pdf-server-deploy.yml`** — Add a post-deploy cleanup step that automatically prunes old images after every successful push.
2. **`pdf-server/scripts/cleanup-artifact-registry.sh`** — New standalone script for manual one-shot cleanup (run from Cloud Shell or CI). Supports `--dry-run` and `--force` flags.

### How It Works

- After every successful deploy, the workflow lists all images in the repo.
- Excludes the `:buildcache` tag (required for registry layer caching).
- Sorts by `createTime` descending, keeps the 5 newest.
- Deletes everything older with `--delete-tags --quiet`.
- Safe: the freshly-pushed image is always in the top 5, and Cloud Run only references recent revisions.

### Standalone Script Features

- `--dry-run` (default): lists what would be deleted without touching anything.
- `--force`: actually deletes.
- `--keep=N`: override the default 5-image retention.
- Configurable via env vars or flags for project, region, repo, image name.

### Cost Impact

- Immediate: drops ~65 images → Artifact Registry bill falls from ~£3.12 to ~£0.25/mo.
- Ongoing: never accumulates more than 5 images + 1 build cache.

### One-Time Action Required

After merge, run the standalone script once from Cloud Shell to clear the backlog:

```bash
bash pdf-server/scripts/cleanup-artifact-registry.sh --force
```

Future deploys will self-clean automatically.