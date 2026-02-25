# Coursera Deadline Tracker

Chrome extension + Cloudflare Worker spike for tracking Coursera deadline changes and sending Telegram alerts.

## One-Click Onboarding (Current UX)

1. Open extension popup.
2. Click `Connect Telegram`.
3. Telegram opens with a deep-link. Send `/start`.
4. Return to popup. It auto-polls link status and auto-connects Coursera session.
5. If Coursera IDs are missing, open your Coursera degree page once and retry/refresh.

Notes:

- Production bundle hides manual setup knobs.
- Dev bundle keeps manual register/connect controls for debugging.

## Workspaces

- `worker/` Cloudflare Worker and tests
- `extension/` MV3 extension

## Test

```bash
bun install
bun test
```

## Local smoke

```bash
bash scripts/e2e-smoke.sh
```

Optional onboarding route smoke:

```bash
SMOKE_ONBOARDING=1 bash scripts/e2e-smoke.sh
```

`SMOKE_ONBOARDING=1` expects worker secrets/bindings to be configured, including Telegram bot token.

## Extension build (Bun bundler)

From repo root:

```bash
bun run build:extension
```

Load unpacked extension from:

`extension/dist`

Extension runtime source files are:

- `extension/background.ts`
- `extension/popup.ts`

`extension/popup.html` is a Bun HTML entrypoint and is bundled/re-written into `extension/dist/popup.html`.

Extension build modes:

- Dev (includes manual dev knobs in popup):  
  `cd extension && bun run build:dev`
- Prod (strips dev knobs from bundle):  
  `cd extension && EXTENSION_BASE_URL=https://<your-worker-host> bun run build:prod`

For incremental JS rebuilds while editing extension scripts:

```bash
cd extension
bun run build:watch
```

## Cloudflared Tunnel

From `worker/`:

```bash
bun run tunnel
```

This starts a Cloudflare quick tunnel and prints a `https://<random>.trycloudflare.com` URL.

For a stable URL, use a named tunnel (after one-time Cloudflare tunnel setup):

```bash
CF_TUNNEL_NAME=coursera-deadline bun run tunnel:fixed
```

Then set Telegram webhook to:

`https://<tunnel-host>/api/telegram/webhook`

## Telegram Bot Commands

After setting webhook, these commands work in Telegram chat with your bot:

- `/status` show last sync + settings
- `/settings` show current notification preferences
- `/pause` pause notifications
- `/resume` resume notifications
- `/mode <all|new|changed|none>` filter which updates notify
- `/tz <IANA timezone>` set timezone used in messages (example: `Asia/Kolkata`)
- `/sync` run immediate sync
- `/test` send test reply
- `/help` show command list

## Telegram Webhook Setup

1. Run worker and expose a reachable URL (Cloudflare deploy or tunnel).
2. Optionally set webhook secret:
   - `wrangler secret put TELEGRAM_WEBHOOK_SECRET`
3. Register webhook:

```bash
TOKEN="<your-telegram-bot-token>"
WORKER_URL="<your-worker-url>"
SECRET="<same-secret-if-configured>"

curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$WORKER_URL/api/telegram/webhook\",\"secret_token\":\"$SECRET\"}"
```
