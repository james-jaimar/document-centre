# syntax=docker/dockerfile:1.7
#
# Document Centre PDF stack — single image, multi-role.
#
# Build once, deploy as 3+ Cloud Run services by setting ROLE at runtime:
#   ROLE=api            → uvicorn FastAPI server (port 8000)
#   ROLE=worker-heavy   → Celery worker for imposition / large PDF assembly
#   ROLE=worker-light   → Celery worker for thumbnails / preflight / conversions
#   ROLE=worker-emails  → Celery worker for SMTP send (kept on VPS for Phase 1+2)
#
# Versions are pinned against pdf-server/docker/MANIFEST.md.

# ───────────────────────────────── base ─────────────────────────────────
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        # PDF stack
        libreoffice \
        ghostscript \
        qpdf \
        poppler-utils \
        # Image / colour stack
        imagemagick \
        libjpeg62-turbo \
        libtiff6 \
        libpng16-16 \
        libwebp7 \
        liblcms2-2 \
        # Fonts (must match VPS — see MANIFEST.md)
        fonts-dejavu-core \
        fonts-liberation \
        fonts-noto \
        fonts-noto-cjk \
        fonts-symbola \
        fontconfig \
        # Build/runtime helpers
        curl \
        ca-certificates \
        unzip \
        xz-utils \
        tini \
    && rm -rf /var/lib/apt/lists/*

# pdfcpu — pinned binary. Build fails loudly if unavailable (don't ship without it).
RUN set -eux; \
    curl -fsSL -o /tmp/pdfcpu.tar.xz \
      https://github.com/pdfcpu/pdfcpu/releases/download/v0.6.0/pdfcpu_0.6.0_Linux_x86_64.tar.xz; \
    tar -xJf /tmp/pdfcpu.tar.xz -C /tmp; \
    mv /tmp/pdfcpu_0.6.0_Linux_x86_64/pdfcpu /usr/local/bin/pdfcpu; \
    chmod +x /usr/local/bin/pdfcpu; \
    rm -rf /tmp/pdfcpu*; \
    pdfcpu version

# ──────────────────────────── python-deps ───────────────────────────────
FROM base AS python-deps

WORKDIR /app
COPY pdf-server/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

# ───────────────────────────── runtime ──────────────────────────────────
FROM python-deps AS runtime

WORKDIR /app

# App source
COPY pdf-server/ /app/

# ICC profiles + scratch dirs
RUN bash /app/scripts/install-icc-profiles.sh || true \
    && mkdir -p /app/storage /tmp/printforge \
    && chmod +x /app/scripts/*.sh

# Default env (overridden per Cloud Run service)
ENV ROLE=api \
    API_HOST=0.0.0.0 \
    API_PORT=8000 \
    LOG_LEVEL=INFO

EXPOSE 8000

# tini → entrypoint dispatches on $ROLE
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
