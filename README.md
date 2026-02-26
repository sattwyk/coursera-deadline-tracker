# Coursera Deadline Tracker

Track Coursera deadlines from a browser extension and get updates in Telegram without constantly checking Coursera manually.

## What You Get

- A browser extension that links your Coursera session
- A Telegram bot for deadline updates and quick commands
- One-click setup from the extension popup

## Install (From GitHub Releases)

1. Open this repo’s **Releases** page.
2. Download the latest `coursera-deadline-tracker-<version>.zip`.
3. Unzip it to a folder you’ll keep (don’t delete it later).
4. Open `chrome://extensions`.
5. Turn on **Developer mode** (top-right).
6. Click **Load unpacked** and select the unzipped folder.

That’s it. No local build needed for normal users.

## First-Time Setup

1. Log into Coursera in the same browser profile where the extension is installed.
2. Click the extension icon to open the popup.
3. Click **Connect Telegram**.
4. Telegram opens; press **Start** (or send `/start`) in the bot chat.
5. Go back to the extension popup.
6. Click **Open Coursera** once and open your degree dashboard page.
7. Come back and click **Fetch Now**.
8. Click **Refresh Status** to confirm everything is connected.

## Daily Use

- Use **Fetch Now** in the popup whenever you want an immediate sync.
- Use Telegram commands and buttons for fast filtering.

### Useful Telegram Commands

- `/status` current sync + settings summary
- `/list upcoming` upcoming deadlines
- `/list pending` pending items
- `/list completed` completed items
- `/list overdue` overdue items
- `/list all` everything
- `/sync` run immediate sync
- `/help` full command help

### Quick Filter Buttons

Inside Telegram responses, use inline buttons:

- `Upcoming`
- `Pending`
- `Completed`
- `Overdue`
- `All`

You’ll also see `Prev` / `Next` buttons when there are multiple pages.

## Troubleshooting (User-Focused)

### Telegram connected but no deadlines appear

- Make sure you opened your Coursera degree page at least once after installing.
- Click **Fetch Now** again.
- Confirm you are logged into Coursera in the same browser profile.

### Bot says auth expired (401/403)

- Reconnect using the extension popup (Connect Telegram / re-link flow).
- Then run `/sync` again.

### Telegram buttons don’t respond

- Send `/status` once, then try buttons again.
- If it still fails, the backend webhook may be unhealthy. Report it to the maintainer/admin of your deployment.

### Reinstalling or updating extension

- Download the latest release zip.
- Unzip it.
- In `chrome://extensions`, click **Reload** on the extension card (or remove + Load unpacked again).

## For Self-Hosting / Contributors

If you are running your own worker/tunnel/dev stack, use:

- [Dev Usage Runbook](/home/satty/projects/coursera-scrapper/docs/runbooks/dev-usage.md)
- [Local Smoke Runbook](/home/satty/projects/coursera-scrapper/docs/runbooks/local-smoke.md)
- [Extension WXT Runbook](/home/satty/projects/coursera-scrapper/docs/runbooks/extension-wxt.md)

Implementation workspace: `extension-wxt/`
