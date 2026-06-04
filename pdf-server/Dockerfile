# syntax=docker/dockerfile:1.7
#
# Document Centre PDF stack — single image, multi-role.
#
# Build once, deploy as 3+ Cloud Run services by setting ROLE at runtime:
#   ROLE=api              → uvicorn FastAPI server (port 8000)
#   ROLE=worker-heavy     → Celery worker for imposition / large PDF assembly
#   ROLE=worker-light     → Celery worker for thumbnails / preflight / conversions
#   ROLE=worker-emails    → Celery worker for SMTP send (kept on VPS for Phase 1+2)
#   ROLE=listener-emails  → Postgres LISTEN/NOTIFY email dispatcher (VPS-only for now)
#   ROLE=beat             → Celery beat scheduler
#
# Versions are pinned against pdf-server/docker/MANIFEST.md.
# Base image matches the live VPS (Ubuntu 24.04 + Python 3.12) to eliminate
# wheel / font / LibreOffice rendering drift.

# ───────────────────────────────── base ─────────────────────────────────
FROM ubuntu:24.04 AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Pre-accept the Microsoft Core Fonts EULA so apt can install them non-interactively.
RUN echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" \
    | debconf-set-selections

# Enable Ubuntu multiverse (required for ttf-mscorefonts-installer).
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common ca-certificates \
    && add-apt-repository -y multiverse \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
        # Python 3.12 (matches VPS)
        python3.12 python3.12-venv python3-pip \
        # PDF stack
        libreoffice \
        libreoffice-java-common \
        libreoffice-gtk3 \
        ghostscript \
        qpdf \
        poppler-utils \
        poppler-data \
        # Image / colour stack
        imagemagick \
        libjpeg-turbo8 \
        libtiff6 \
        libpng16-16t64 \
        libwebp7 \
        liblcms2-2 \
        # Fonts (apt-installable set — must match VPS, see MANIFEST.md)
        fontconfig \
        fonts-dejavu \
        fonts-dejavu-core \
        fonts-dejavu-extra \
        fonts-liberation \
        fonts-liberation-sans-narrow \
        fonts-noto \
        fonts-noto-core \
        fonts-noto-extra \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
        fonts-noto-color-emoji \
        fonts-noto-mono \
        fonts-noto-ui-core \
        fonts-noto-ui-extra \
        fonts-noto-unhinted \
        fonts-crosextra-caladea \
        fonts-crosextra-carlito \
        fonts-linuxlibertine \
        fonts-sil-gentium \
        fonts-sil-gentium-basic \
        fonts-texgyre \
        fonts-urw-base35 \
        fonts-droid-fallback \
        fonts-opensymbol \
        ttf-mscorefonts-installer \
        # Build/runtime helpers
        curl \
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

# Proprietary fonts bundled in the repo under pdf-server/fonts/.
# These mirror /usr/local/share/fonts/{microsoft,century-gothic}/ on the VPS.
# Tenant manages licensing for redistribution; see pdf-server/fonts/README.md.
COPY pdf-server/fonts/ /usr/local/share/fonts/
RUN fc-cache -fv >/dev/null \
    && echo "Installed font families:" \
    && fc-list : family | sort -u | head -n 40

# ──────────────────────────── python-deps ───────────────────────────────
FROM base AS python-deps

# Create a venv on Python 3.12 (matches VPS layout: /opt/document-centre-api/.venv).
RUN python3.12 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV=/opt/venv

WORKDIR /app
COPY pdf-server/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# ───────────────────────────── runtime ──────────────────────────────────
FROM python-deps AS runtime

WORKDIR /app

# App source
COPY pdf-server/ /app/

# ICC profiles + scratch dirs (Cloud Run filesystem is RO except /tmp).
RUN bash /app/scripts/install-icc-profiles.sh || true \
    && mkdir -p /app/storage /tmp/printforge /tmp/celery \
    && chmod +x /app/scripts/*.sh

# Default env (overridden per Cloud Run service).
# Cloud Run injects PORT=8080 at runtime; entrypoint honours $PORT first and
# falls back to API_PORT for local docker run.
ENV ROLE=api \
    API_HOST=0.0.0.0 \
    API_PORT=8080 \
    LOG_LEVEL=INFO

EXPOSE 8080

# tini → entrypoint dispatches on $ROLE
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
