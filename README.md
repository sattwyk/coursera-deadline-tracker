<img src="logo.png" alt="Coursera Deadline Tracker" width="120">

# Coursera Deadline Tracker

Get Telegram alerts when your Coursera assignment deadlines change. Tracks your degree page and notifies you of new, modified, or approaching deadlines.

## What This Does

- 🔔 **Alerts you on Telegram** when deadlines are added, changed, or due soon
- 👀 **Watches your Coursera degree page** automatically
- ⏰ **Respects your timezone** - see deadlines in your local time
- 🔍 **Search anywhere** - type `@yourbot upcoming` in any chat to see deadlines

## Prerequisites

- A **Telegram account** (to receive alerts)
- A **Chrome browser** (to run the extension)
- A **Coursera Plus** or degree program with deadlines

## Set Up

### Step 1: Deploy the Worker

If you have Cloudflare Wrangler installed:

```bash
cd worker
wrangler deploy
```

Or deploy from the [Cloudflare Dashboard](https://dash.cloudflare.com/).

### Step 2: Get a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the instructions
3. Copy your **bot token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### Step 3: Configure the Worker

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# Paste your bot token when prompted
```

### Step 4: Set the Webhook

```bash
# Replace with your values
TOKEN="<your-bot-token>"
WORKER_URL="https://your-worker.workers.dev"

curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d "{\"url\":\"$WORKER_URL/api/telegram/webhook\"}"
```

### Step 5: Load the Extension

1. Download the release from GitHub Releases
2. Unzip the file
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode** (top right)
5. Click **Load unpacked**
6. Select the unzipped folder

### Step 6: Connect Everything

1. Open the extension in Chrome
2. Click **"Connect Telegram"**
3. Telegram opens with a deep link - tap **START**
4. Return to the extension - it auto-connects
5. Open your Coursera degree page once to auto-detect your IDs

You're all set! You'll get alerts when deadlines change.

## Commands

In your Telegram chat with the bot:

| Command            | What It Does                        |
| ------------------ | ----------------------------------- |
| `/start`           | Link your Telegram to the extension |
| `/status`          | See last sync time and settings     |
| `/list upcoming`   | Show upcoming deadlines             |
| `/list pending`    | Show pending assignments            |
| `/list overdue`    | Show overdue items                  |
| `/settings`        | Change notification preferences     |
| `/pause`           | Stop notifications temporarily      |
| `/resume`          | Re-enable notifications             |
| `/tz Asia/Kolkata` | Set your timezone                   |
| `/help`            | Show all commands                   |

### Inline Search

After enabling inline mode with BotFather, you can search deadlines from any chat:

```
@coursera_deadline_tracker_bot upcoming
```

## Troubleshooting

**No deadlines showing?**

- Open your Coursera degree page and refresh
- Run `/sync` to trigger a manual fetch

**Not receiving messages?**

- Check `/status` to see last sync time
- Make sure you're not in `/pause` mode

**Need to change the worker URL?**

- Re-run the release script with your new URL:
  ```
  EXTENSION_BASE_URL=https://new-url.workers.dev bun run release
  ```

## Support

- Open an issue on [GitHub](https://github.com/sattwyk/coursera-deadline-tracker)
- For bugs or feature requests, include your worker URL and what you tried
