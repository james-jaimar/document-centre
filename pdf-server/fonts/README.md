# Proprietary fonts bundled into the Docker image

This directory is `COPY`'d into `/usr/local/share/fonts/` during Docker build
(see `pdf-server/Dockerfile`) and then registered with `fc-cache -fv`. It
mirrors the layout of the live VPS at `/usr/local/share/fonts/`.

## Expected subdirectories

```
pdf-server/fonts/
├── microsoft/        # Aptos, Calibri, Cambria, Candara, Consolas, Constantia, Corbel
└── century-gothic/   # GOTHIC.TTF, GOTHICB.TTF, GOTHICBI.TTF, GOTHICI.TTF
```

## How to populate (one-time, from the VPS)

```bash
# On the VPS:
tar czf /tmp/dc-fonts.tgz -C /usr/local/share/fonts microsoft century-gothic

# On your laptop:
scp <vps>:/tmp/dc-fonts.tgz .
tar xzf dc-fonts.tgz -C pdf-server/fonts/
git add pdf-server/fonts/microsoft pdf-server/fonts/century-gothic
git commit -m "Bundle proprietary fonts for Docker image parity with VPS"
git push
```

## Licensing

These fonts are proprietary (Microsoft + Monotype). Redistribution responsibility
sits with the project owner — confirm your licensing covers shipping them inside
a private Docker image to GCP Artifact Registry.

The repo is private, the Artifact Registry repo (`dc-pdf`) is private, and the
Cloud Run services are not user-facing (only the running container sees the
fonts) — but this is **not** legal advice.

## What's already covered by apt

The following are installed via `apt-get` and don't need to live here:

- DejaVu, Liberation, Noto (+ CJK + emoji), Symbola, Droid
- Carlito (Calibri metric-compatible substitute)
- Caladea (Cambria metric-compatible substitute)
- Linux Libertine, SIL Gentium, TeX Gyre, URW Base35
- Microsoft Core Fonts: Arial, Times New Roman, Courier New, Verdana, Trebuchet,
  Andale, Georgia, Impact, Webdings (via `ttf-mscorefonts-installer`)

## Drift detection

If you add a new font on the VPS:

1. Drop it under the matching subdirectory here.
2. Re-run `pdf-server/scripts/audit-vps.sh` and commit the regenerated
   `pdf-server/docker/MANIFEST.md`.

The `dockerfile-drift` workflow will block PRs that change dependency files
without an accompanying MANIFEST/Dockerfile update.
