<img src="logo.png" alt="Coursera Deadline Tracker" width="120">

# Coursera Deadline Tracker

Get Telegram alerts when your Coursera assignment deadlines change. Tracks your degree page and notifies you of new, modified, or approaching deadlines.

## Quick Start

### 1. Deploy the Worker

```bash
cd worker
wrangler deploy
```

### 2. Configure Secrets

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET  # optional
```

### 3. Set Up Telegram Webhook

```bash
# Replace with your values
TOKEN="<bot-token>" WORKER_URL="https://your-worker.workers.dev" \
curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$WORKER_URL/api/telegram/webhook\"}"
```

### 4. Load the Extension

```bash
# Build the extension
EXTENSION_BASE_URL=https://your-worker.workers.dev bun run release

# Or for local dev
bun run build:extension
```

Load unpacked from `extension/dist` in Chrome (`chrome://extensions/` → Developer mode → Load unpacked).

### 5. Open the Extension

1. Click "Connect Telegram" → sends `/start` to your bot
2. Return to popup → auto-connects
3. Open your Coursera degree page once to auto-detect IDs

## Features

- **Auto-detect deadlines** - Monitors your Coursera degree page for changes
- **Telegram notifications** - Alerts for new, changed, or approaching deadlines
- **Inline search** - Type `@yourbot upcoming` in any chat to see deadlines
- **Timezone support** - Set your timezone with `/tz Asia/Kolkata`
- **Filter modes** - `/mode all|new|changed|none` controls which updates notify

### Telegram Commands

| Command              | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `/start`             | Link Telegram to extension                              |
| `/status`            | Show last sync + settings                               |
| `/list <filter>`     | Show deadlines (pending/completed/upcoming/overdue/all) |
| `/settings`          | Notification preferences                                |
| `/pause` / `/resume` | Toggle notifications                                    |
| `/mode <mode>`       | Set notification filter                                 |
| `/tz <timezone>`     | Set timezone                                            |
| `/sync`              | Run immediate sync                                      |
| `/help`              | Show all commands                                       |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Chrome          │────▶│ Cloudflare       │────▶│ Coursera    │
│ Extension       │     │ Worker           │     │ API         │
│ (popup.ts)      │     │ (worker/)        │     │             │
└─────────────────┘     └────────┬─────────┘     └─────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Telegram         │
                        │ Bot + Webhook    │
                        └──────────────────┘
```

- **extension/** - Chrome MV3 extension (popup + background)
- **worker/** - Cloudflare Worker (fetch, diff, notify)

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Local development
cd worker && bun run dev

# Test cron trigger locally
cd worker && bun run cron

# Full feature simulation
BASE_URL=http://127.0.0.1:8787 \
SIM_CHAT_ID=<chat-id> \
bun run simulate:all
```

See [docs/runbooks/dev-usage.md](docs/runbooks/dev-usage.md) for full dev workflow.

## Release

```bash
# Create GitHub release with extension zip
EXTENSION_BASE_URL=https://your-worker.workers.dev bun run release
```

Downloads as a draft release. Users load the zip directly into Chrome.

## Tech Stack

- **Runtime**: Bun
- **Worker**: Cloudflare Workers + D1 + KV
- **Extension**: TypeScript + Bun bundler
- **Linting**: oxlint + oxfmt
- **Testing**: Bun test
