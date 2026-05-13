FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    ghostscript \
    qpdf \
    poppler-utils \
    curl \
    unzip \
    xz-utils \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-symbola \
    && rm -rf /var/lib/apt/lists/*

# pdfcpu is optional for some imposition helpers. Keep build resilient if the
# upstream archive layout changes or GitHub rate-limits a build.
RUN set -eux; \
    curl -fsSL https://github.com/pdfcpu/pdfcpu/releases/download/v0.6.0/pdfcpu_0.6.0_Linux_x86_64.tar.xz -o /tmp/pdfcpu.tar.xz || exit 0; \
    tar -xJf /tmp/pdfcpu.tar.xz -C /tmp || exit 0; \
    if [ -f /tmp/pdfcpu_0.6.0_Linux_x86_64/pdfcpu ]; then \
      mv /tmp/pdfcpu_0.6.0_Linux_x86_64/pdfcpu /usr/local/bin/pdfcpu; \
      chmod +x /usr/local/bin/pdfcpu; \
    fi

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/storage /tmp/printforge && chmod +x /app/scripts/*.sh

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
