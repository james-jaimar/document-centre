Add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to both GitHub Actions workflows so the Node 20 deprecation does not surprise us on June 16th.

**Files to edit:**
- `.github/workflows/pdf-server-deploy.yml`
- `.github/workflows/dockerfile-drift.yml`

**Change:**
In each workflow, add the environment variable at the top-level `env:` block (or create one if absent).

`pdf-server-deploy.yml` already has an `env:` block near line 30 — add `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` there.

`dockerfile-drift.yml` has no `env:` block — add one:
```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

This is a no-op safety flag. It simply tells the runner to use Node 24 for the affected actions now, avoiding a hard failure when GitHub removes Node 20 on September 16th.