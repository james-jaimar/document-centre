## Goal

Make the GitHub Actions Docker build faster and more reliable by (1) authenticating to Docker Hub to remove anonymous rate-limit risk, and (2) enabling layer caching so most rebuilds reuse previous layers instead of starting from scratch.

## Why rebuilds currently take so long

The workflow uses plain `docker build` with no cache source. GitHub Actions runners are ephemeral — each run starts on a fresh VM with an empty Docker layer store, so every `FROM ubuntu:24.04`, every `apt-get install` (LibreOffice, fonts, Ghostscript, etc.), and every `pip install -r requirements.txt` runs from zero. That's where the ~minutes go, not the app source copy.

The fix is to push the build through `docker/build-push-action` with a **remote cache** stored in Google Artifact Registry (the registry we already use). On the next run, Buildx pulls the layer manifest from GAR and skips any stage whose inputs haven't changed.

## Changes (all in `.github/workflows/pdf-server-deploy.yml`)

1. **Add Docker Hub login step** (before the build) using `docker/login-action@v3` with two new GitHub Action secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. This authenticates the `FROM ubuntu:24.04` pull and removes anonymous rate-limit failures like the one you saw.

2. **Add `docker/setup-buildx-action@v3`** to enable BuildKit + remote cache support on the runner.

3. **Replace the manual `docker build` + `docker push` steps with `docker/build-push-action@v6`** configured with:
   - `cache-from: type=registry,ref=<GAR>/dc-pdf/server:buildcache`
   - `cache-to:   type=registry,ref=<GAR>/dc-pdf/server:buildcache,mode=max`
   - Tags: the existing per-SHA tag.
   - `load: true` on the build step (so the smoke-test step can still `docker run` the image locally), and a separate push afterwards — or split into a build-only step, smoke test, then a push step that reuses the cache. Easiest is `load: true` + `push: false` on build, then a final `docker push` using the same tag.

4. **Keep the smoke test and Cloud Run deploy steps unchanged.** They still consume the same per-SHA image tag.

5. **Dockerfile-side tweak (optional, small):** Re-order `COPY pdf-server/ /app/` to come *after* the venv + apt layers (it already does). No change needed there — the current ordering already caches well; the bottleneck is purely that the runner has no cache between runs.

## Expected impact

- **First run after the change:** same speed as today (populates the `:buildcache` tag in GAR).
- **Every run after that** where `requirements.txt`, `install-ubuntu.sh`, and the Dockerfile haven't changed: skips apt + pip layers entirely. Typical build drops from "rebuild everything" to ~1–2 minutes — only the `COPY pdf-server/ /app/` layer and the final tag/push run.
- **Pure code change to `pdf-server/app/...`:** ~30–60s build, dominated by the push.
- **Touching `requirements.txt`:** pip layer rebuilds, apt layer still cached.
- **Touching `install-ubuntu.sh` or the Dockerfile base block:** full rebuild (as expected — you've changed the OS layer).

## What you'll need to do (one-time)

- Add two GitHub repo secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (the access token you just created).
- No GCP changes needed — the cache lives in the existing `dc-pdf` Artifact Registry repo under a separate `:buildcache` tag, so the runtime SA permissions you already have cover it.

## Out of scope

- Switching to a Docker Hub pull-through cache via GAR (bigger setup, not needed now that you have a Docker Hub login).
- Multi-arch builds.
- Splitting the Dockerfile into separate base/app images (would give even better caching but is a larger refactor — happy to do this later if rebuild times still feel slow after the cache is in place).
