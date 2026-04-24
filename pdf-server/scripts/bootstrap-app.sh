#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/document-centre-api}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="$APP_DIR/.venv"
ENV_FILE="$APP_DIR/.env"

if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory not found: $APP_DIR"
  exit 1
fi

if [[ ! -f "$APP_DIR/requirements.txt" ]]; then
  echo "requirements.txt not found in $APP_DIR"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE"
  echo "Copy .env.example to .env and fill in the real values first."
  exit 1
fi

cd "$APP_DIR"

$PYTHON_BIN -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip wheel setuptools
pip install -r requirements.txt

mkdir -p "$APP_DIR/storage" "$APP_DIR/tmp"
chmod 755 "$APP_DIR/storage" "$APP_DIR/tmp"

cat <<MSG

Bootstrap complete.

Next:
1. sudo cp deploy/systemd/document-centre-api.service /etc/systemd/system/
2. sudo cp deploy/systemd/document-centre-worker.service /etc/systemd/system/
3. sudo cp deploy/nginx/document-centre-api.conf /etc/nginx/sites-available/document-centre-api.conf
4. Edit the Nginx server_name and SSL paths
5. sudo systemctl daemon-reload
6. sudo systemctl enable --now document-centre-api document-centre-worker
7. sudo ln -s /etc/nginx/sites-available/document-centre-api.conf /etc/nginx/sites-enabled/document-centre-api.conf
8. sudo nginx -t && sudo systemctl reload nginx

MSG
