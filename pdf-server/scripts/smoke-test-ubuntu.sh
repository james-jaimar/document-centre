#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"

echo "Health:"
curl -fsS "$BASE_URL/health" || exit 1

echo "\nRoot:"
curl -fsS "$BASE_URL/" || exit 1

echo "\nAdmin login page headers:"
curl -I "$BASE_URL/admin" || true
