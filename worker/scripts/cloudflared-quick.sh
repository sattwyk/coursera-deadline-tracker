#!/usr/bin/env sh
set -eu

PORT="${PORT:-8787}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found in PATH."
  echo "Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

echo "Starting Cloudflare quick tunnel to http://127.0.0.1:${PORT}"
echo "Copy the https://*.trycloudflare.com URL and use it for Telegram webhook."
exec cloudflared tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate
