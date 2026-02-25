#!/usr/bin/env sh
set -eu

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found in PATH."
  echo "Install from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

if [ -z "${CF_TUNNEL_NAME:-}" ]; then
  echo "CF_TUNNEL_NAME is required for a stable URL."
  echo "Example: CF_TUNNEL_NAME=coursera-deadline bun run tunnel:fixed"
  exit 1
fi

echo "Starting named Cloudflare tunnel: ${CF_TUNNEL_NAME}"
echo "This requires prior cloudflared login/create/route setup."
exec cloudflared tunnel run "${CF_TUNNEL_NAME}" --no-autoupdate
