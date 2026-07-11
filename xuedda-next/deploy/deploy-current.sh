#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/xuedda-next}"
PKG="${1:?Usage: deploy-current.sh /tmp/package.tar.gz [tag]}"
TAG="${2:-manual}"
TS="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="/tmp/xuedda-release-$TS"
BACKUP_DIR="/root/xuedda-deploy-backups"
BACKUP_FILE="$BACKUP_DIR/$TS-before-$TAG.tgz"

mkdir -p "$BACKUP_DIR" "$RELEASE_DIR"

echo "[1/7] Backup current app -> $BACKUP_FILE"
tar -czf "$BACKUP_FILE" -C "$APP_DIR" \
  --exclude='./node_modules' \
  --exclude='./.env' \
  --exclude='./public/uploads' \
  --exclude='./dist/client/uploads' \
  .

echo "[2/7] Extract release package"
tar -xzf "$PKG" -C "$RELEASE_DIR"

echo "[3/7] Sync release, preserving .env/node_modules/uploads"
rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='public/uploads' \
  --exclude='dist/client/uploads' \
  "$RELEASE_DIR"/ "$APP_DIR"/

echo "[4/7] Restore uploads symlink"
cd "$APP_DIR"
bash deploy/fix-uploads-link.sh

echo "[5/7] Ensure production dependencies"
npm install --omit=dev --no-audit --no-fund

echo "[6/7] Reload PM2"
pm2 reload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "[7/7] Health check"
sleep 2
curl -fsS -I http://localhost:4321/ | head -5
curl -fsS -I http://localhost:4321/c/software | head -5

rm -rf "$RELEASE_DIR"
echo "DEPLOY_OK:$TS"
