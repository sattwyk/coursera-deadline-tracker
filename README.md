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

For actual day-to-day dev run/use flow (server + tunnel + extension + Telegram), follow:

`docs/runbooks/dev-usage.md`

Optional onboarding route smoke:

```bash
SMOKE_ONBOARDING=1 bash scripts/e2e-smoke.sh
```

`SMOKE_ONBOARDING=1` expects worker secrets/bindings to be configured, including Telegram bot token.

## Full Feature Simulation

Run a full onboarding + session + sync + Telegram command simulation against your local worker:

```bash
BASE_URL=http://127.0.0.1:8787 \
SIM_CHAT_ID=<your-telegram-chat-id> \
SIM_WEBHOOK_SECRET=<your-webhook-secret-if-set> \
bun run simulate:all
```

The simulation now prints deadlines grouped by filters (`upcoming`, `pending`, `completed`, `overdue`, `all`) using `/api/deadlines`.

Optional flags:

- `SIM_RUN_COMMANDS=false` to skip Telegram command replay.
- `SIM_WEBHOOK_SECRET` (or `TELEGRAM_WEBHOOK_SECRET`) if webhook route enforces secret header.
- `SIM_INLINE_STRICT=true` to fail on inline-query simulation errors.
- `SIM_REAL_COURSERA=true` to use real Coursera session values. Required env in this mode:
  - `CAUTH`
  - `CSRF3_TOKEN`
  - `COURSERA_USER_ID`
  - `DEGREE_IDS` (comma-separated)

Note: inline-query simulation uses a synthetic `inline_query.id` and may be rejected by Telegram API in local runs.
This does not indicate inline mode is broken. For real validation, test inline mode directly in Telegram by typing
`@<your_bot_username> upcoming` in any chat.

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
- `/list <pending|completed|upcoming|overdue|all>` show filtered deadlines with course/item details
- `/settings` show current notification preferences
- `/pause` pause notifications
- `/resume` resume notifications
- `/mode <all|new|changed|none>` filter which updates notify
- `/tz <IANA timezone>` set timezone used in messages (example: `Asia/Kolkata`)
- `/sync` run immediate sync
- `/test` send test reply
- `/help` show command list

`/status` and `/list` now include inline keyboard controls for quick filtering, paging and actions.

Inline mode is also supported in the webhook: after enabling inline mode in BotFather, users can type
`@coursera_deadline_tracker_bot upcoming` in any chat to insert deadline cards.

## Telegram Command Menu Sync

To publish command menus and scopes (private + group, with `en/hi/es` localizations):

```bash
TELEGRAM_BOT_TOKEN=<your-bot-token> bun run telegram:sync-commands
```

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
