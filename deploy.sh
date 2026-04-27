#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${SERVER:-ubuntu@145.239.71.158}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/wix-3dstore/frontend/metrics_platform_published}"
NPM_BUILD_SCRIPT="${NPM_BUILD_SCRIPT:-build}"
RUN_REMOTE_NPM_CI="${RUN_REMOTE_NPM_CI:-0}"

echo "==> Installing dependencies..."
(cd "$APP_DIR" && npm ci)

echo "==> Building project..."
(cd "$APP_DIR" && npm run "$NPM_BUILD_SCRIPT")

echo "==> Deploying to $SERVER:$REMOTE_DIR ..."
rsync -avz --delete --rsync-path="sudo rsync" "$APP_DIR/.next/" "$SERVER:$REMOTE_DIR/.next/"
rsync -avz --delete --rsync-path="sudo rsync" "$APP_DIR/public/" "$SERVER:$REMOTE_DIR/public/"

for f in package.json package-lock.json next.config.ts next.config.js postcss.config.mjs; do
  if [[ -f "$APP_DIR/$f" ]]; then
    rsync -avz --rsync-path="sudo rsync" "$APP_DIR/$f" "$SERVER:$REMOTE_DIR/"
  fi
done

if [[ -d "$APP_DIR/patches" ]]; then
  rsync -avz --delete --rsync-path="sudo rsync" "$APP_DIR/patches/" "$SERVER:$REMOTE_DIR/patches/"
fi

if [[ "$RUN_REMOTE_NPM_CI" == "1" ]]; then
  echo "==> Running npm ci --omit=dev on server..."
  ssh "$SERVER" "cd '$REMOTE_DIR' && npm ci --omit=dev"
fi

echo "==> Done! Deployed successfully."
