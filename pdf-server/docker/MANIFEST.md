# Document Centre VPS Manifest

> **Status: placeholder.** Replace this file with the real output of
> `pdf-server/scripts/audit-vps.sh` run against the live production VPS:
>
> ```bash
> ssh root@<vps-host> 'bash -s' \
>   < pdf-server/scripts/audit-vps.sh \
>   > pdf-server/docker/MANIFEST.md
> ```
>
> Commit the result. The Dockerfile pins versions against this file, and the
> drift-check CI gate fails if `requirements.txt` or the install scripts
> change without an updated manifest.

## OS

Expected: Debian 12 (bookworm) slim — matches `python:3.11-slim` base.

## APT packages (planned baseline)

These are mirrored from the current Dockerfile + install scripts. Confirm
against the audit output and update if the live host has more:

```
libreoffice            (system version, ~24.x on bookworm)
ghostscript            10.0.0+
qpdf                   11.x
poppler-utils          22.x
fonts-dejavu-core
fonts-liberation
fonts-noto
fonts-noto-cjk
fonts-symbola
imagemagick            (if used by preflight)
libjpeg62-turbo
libtiff6
libpng16-16
libwebp7
fontconfig
liblcms2-2             (ICC colour management)
```

## Pinned external binaries

```
pdfcpu                 0.6.0     (downloaded in Dockerfile)
```

## Python deps

Source of truth: `pdf-server/requirements.txt`.

## ICC profiles

Provisioned by `pdf-server/scripts/install-icc-profiles.sh`. Verify the
audit output lists the expected `.icc` files under `/usr/share/color/icc/`.

## Systemd → Cloud Run mapping

| VPS systemd unit                        | Cloud Run role          |
| --------------------------------------- | ----------------------- |
| document-centre-api                     | ROLE=api                |
| document-centre-worker-heavy            | ROLE=worker-heavy       |
| document-centre-worker-light            | ROLE=worker-light       |
| document-centre-worker-emails           | (stays on VPS Phase 1)  |
| document-centre-listener-emails         | (stays on VPS — LISTEN) |
| document-centre-beat                    | (stays on VPS Phase 1)  |
