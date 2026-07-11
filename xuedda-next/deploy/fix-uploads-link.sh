#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/xuedda-next}"
LEGACY_UPLOADS="${LEGACY_UPLOADS:-/www/wwwroot/www.xuedda.com/uploads}"
CLIENT_UPLOADS="$APP_DIR/dist/client/uploads"

mkdir -p "$LEGACY_UPLOADS"

if [ -d "$CLIENT_UPLOADS" ] && [ ! -L "$CLIENT_UPLOADS" ]; then
  mkdir -p "$LEGACY_UPLOADS/admin"
  if [ -d "$CLIENT_UPLOADS/admin" ]; then
    cp -an "$CLIENT_UPLOADS/admin/." "$LEGACY_UPLOADS/admin/" || true
  fi
  mv "$CLIENT_UPLOADS" "$CLIENT_UPLOADS.local-$(date +%Y%m%d%H%M%S)"
fi

rm -f "$CLIENT_UPLOADS"
ln -s "$LEGACY_UPLOADS" "$CLIENT_UPLOADS"

echo "$CLIENT_UPLOADS -> $LEGACY_UPLOADS"
