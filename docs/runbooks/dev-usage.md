# Dev Usage Runbook (Run + Use End-to-End)

This guide is for **actually running** the project in dev and using it through:

- Cloudflare Worker (local)
- Telegram webhook (via tunnel)
- Chrome extension (dev build)
- Real Telegram bot interaction (`/start`, buttons, `/list`, inline mode)

## 0) Prerequisites

- Bun installed
- Chrome/Chromium
- Telegram bot token from BotFather
- Coursera logged in in the same browser profile where extension runs

From repo root:

```bash
bun install
```

## 1) Configure worker secrets (once per machine)

From `worker/`:

```bash
cd worker
bunx wrangler secret put TELEGRAM_BOT_TOKEN
bunx wrangler secret put SESSION_SECRET
bunx wrangler secret put TELEGRAM_WEBHOOK_SECRET
bunx wrangler secret put TELEGRAM_BOT_USERNAME
```

Notes:

- `SESSION_SECRET` can be any long random string (32+ chars recommended).
- Keep `TELEGRAM_WEBHOOK_SECRET` stable (you’ll reuse it in webhook setup).

## 2) Start local worker

Terminal A:

```bash
cd worker
bun run dev
```

Expected: `Ready on http://localhost:8787`

## 3) Expose local worker to Telegram

Terminal B:

```bash
cd worker
bun run tunnel
```

Copy the HTTPS tunnel URL, for example:

`https://abc123.trycloudflare.com`

Set it in your shell:

```bash
export WORKER_URL="https://abc123.trycloudflare.com"
```

## 4) Register webhook with required update types

Terminal C (anywhere):

```bash
export TOKEN="<your_bot_token>"
export SECRET="<your_telegram_webhook_secret>"

curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$WORKER_URL/api/telegram/webhook\",\"secret_token\":\"$SECRET\",\"allowed_updates\":[\"message\",\"edited_message\",\"callback_query\",\"inline_query\"]}"
```

Verify:

```bash
curl -sS "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```

`url` must match `$WORKER_URL/api/telegram/webhook` and `last_error_message` should be empty.

## 5) Sync bot command menus/scopes

From repo root:

```bash
TELEGRAM_BOT_TOKEN="$TOKEN" bun run telegram:sync-commands
```

## 6) Build extension (dev mode)

Terminal D:

```bash
cd extension
bun run build:watch
```

This keeps `extension/dist` updated.

## 7) Load extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select: `.../coursera-scrapper/extension/dist`

## 8) Use the product flow

1. Open extension popup
2. Click **Connect Telegram**
3. Telegram opens bot deep-link
4. Send `/start` to bot
5. Return to extension popup
6. Open your Coursera degree page once and refresh
7. Popup should move to connected state and allow sync
8. Click **Sync Now**

## 9) Verify Telegram features

In bot chat:

- `/status`
- `/list upcoming`
- `/list pending`
- `/list completed`
- `/list all`

Then tap inline keyboard buttons under bot messages:

- Upcoming / Pending / Completed / Overdue / All
- Prev / Next
- Sync now
- Pause / Resume

Also test inline mode in any Telegram chat:

```text
@coursera_deadline_tracker_bot upcoming
```

Pick a result and send it.

## 10) If buttons do nothing

Usually this is webhook/update config, not bot logic.

1. Re-run webhook setup in Step 4 (must include `callback_query` in `allowed_updates`)
2. Confirm tunnel URL didn’t rotate
3. Confirm `TELEGRAM_WEBHOOK_SECRET` matches the webhook secret you used
4. Watch worker logs in Terminal A while pressing a button

You should see callback traffic reaching `/api/telegram/webhook`.

## 11) Optional local simulation command

This runs a scripted flow (useful sanity check):

```bash
BASE_URL=http://127.0.0.1:8787 \
SIM_CHAT_ID=<your_chat_id> \
SIM_WEBHOOK_SECRET="$SECRET" \
bun run simulate:all
```

This is optional; the primary validation is the real flow above.
