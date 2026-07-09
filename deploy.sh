#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${SERVER:-ubuntu@145.239.71.158}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/tunzone/frontend/published}"
REMOTE_OWNER="${REMOTE_OWNER:-ubuntu:ubuntu}"
PM2_NAME="${PM2_NAME:-tunzone-published}"
PORT="${PORT:-3001}"
NPM_BUILD_SCRIPT="${NPM_BUILD_SCRIPT:-build}"
NPM_CI_FLAGS="${NPM_CI_FLAGS:---legacy-peer-deps}"
SSH="${SSH:-ssh}"

echo "==> Preparing $SERVER:$REMOTE_DIR ..."
$SSH "$SERVER" "sudo mkdir -p '$REMOTE_DIR' && sudo chown -R '$REMOTE_OWNER' '$REMOTE_DIR'"

echo "==> Syncing source to $SERVER:$REMOTE_DIR ..."
rsync -avz --delete \
  --exclude ".git" \
  --exclude ".cursor" \
  --exclude ".next" \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude ".env.local" \
  --exclude ".env.*.local" \
  --exclude ".DS_Store" \
  --exclude "npm-debug.log*" \
  --rsync-path="sudo rsync" \
  "$APP_DIR/" "$SERVER:$REMOTE_DIR/"

$SSH "$SERVER" "cd '$REMOTE_DIR' \
  && sudo rm -rf .git .cursor public/models src/app/api/meshy \
  && sudo chown -R '$REMOTE_OWNER' '$REMOTE_DIR'"

# --- Ensure server-side API keys are present in remote .env.local ----------
SYNC_KEYS=(ANTHROPIC_API_KEY GOOGLE_AI_API_KEY OPENAI_API_KEY AI_API_URL AI_MODEL INTERNAL_API_KEY NEXT_PUBLIC_POSTHOG_KEY)
echo "==> Syncing server-side API keys to remote .env.local ..."
$SSH "$SERVER" "touch '$REMOTE_DIR/.env.local'"
for KEY in "${SYNC_KEYS[@]}"; do
  VAL=$(grep "^${KEY}=" "$APP_DIR/.env.local" 2>/dev/null | head -1 | cut -d= -f2-)
  if [ -n "$VAL" ]; then
    $SSH "$SERVER" "cd '$REMOTE_DIR' && \
      if grep -q '^${KEY}=' .env.local 2>/dev/null; then \
        sed -i 's|^${KEY}=.*|${KEY}=${VAL}|' .env.local; \
      else \
        echo '${KEY}=${VAL}' >> .env.local; \
      fi"
  fi
done
# Production LARAVEL_API_URL (server-to-server, not from local dev value)
LARAVEL_PROD_URL="${LARAVEL_PROD_URL:-https://api.tunzone.com/api}"
$SSH "$SERVER" "cd '$REMOTE_DIR' && \
  if grep -q '^LARAVEL_API_URL=' .env.local 2>/dev/null; then \
    sed -i 's|^LARAVEL_API_URL=.*|LARAVEL_API_URL=${LARAVEL_PROD_URL}|' .env.local; \
  else \
    echo 'LARAVEL_API_URL=${LARAVEL_PROD_URL}' >> .env.local; \
  fi"

# --- Ensure nginx allows large request bodies and long AI timeouts ----------
NGINX_BODY_SIZE="${NGINX_BODY_SIZE:-50m}"
NGINX_SITE_CONF="/etc/nginx/sites-available/user-published.tunzone.com"
echo "==> Ensuring nginx client_max_body_size and proxy timeouts ..."
$SSH "$SERVER" "
  NEED_RELOAD=0

  # Global body-size snippet
  SNIPPET=/etc/nginx/conf.d/body-size.conf
  if [ ! -f \"\$SNIPPET\" ]; then
    echo 'client_max_body_size ${NGINX_BODY_SIZE};' | sudo tee \"\$SNIPPET\" >/dev/null
    NEED_RELOAD=1
    echo '   -> Created \$SNIPPET'
  fi

  # Add client_max_body_size + proxy timeouts to the wildcard server block
  if ! grep -q 'proxy_read_timeout' '${NGINX_SITE_CONF}' 2>/dev/null; then
    sudo sed -i '/proxy_cache_bypass/a\\n        proxy_read_timeout 180s;\n        proxy_send_timeout 180s;\n        proxy_connect_timeout 10s;' '${NGINX_SITE_CONF}'
    NEED_RELOAD=1
    echo '   -> Added proxy timeouts to ${NGINX_SITE_CONF}'
  fi
  if ! grep -q 'client_max_body_size' '${NGINX_SITE_CONF}' 2>/dev/null; then
    sudo sed -i '/error_log/a\\n    client_max_body_size ${NGINX_BODY_SIZE};' '${NGINX_SITE_CONF}'
    NEED_RELOAD=1
    echo '   -> Added client_max_body_size to ${NGINX_SITE_CONF}'
  fi

  if [ \"\$NEED_RELOAD\" -eq 1 ]; then
    sudo nginx -t && sudo systemctl reload nginx
    echo '   -> Nginx reloaded'
  else
    echo '   -> Nginx config already up to date'
  fi
"

echo "==> Installing, building, and restarting PM2 on server..."
$SSH "$SERVER" "cd '$REMOTE_DIR' \
  && npm ci $NPM_CI_FLAGS \
  && npm run '$NPM_BUILD_SCRIPT' \
  && if pm2 describe '$PM2_NAME' >/dev/null 2>&1; then PORT='$PORT' pm2 reload '$PM2_NAME' --update-env; else PORT='$PORT' pm2 start npm --name '$PM2_NAME' -- start; fi \
  && pm2 save"

echo "==> Done! Deployed successfully."
