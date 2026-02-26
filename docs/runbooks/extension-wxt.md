# Extension WXT Runbook

This runbook is for developing and releasing the active extension implementation in `extension-wxt/`.

## Prerequisites

- Worker running (local or deployed)
- `WXT_WORKER_BASE_URL` set when needed

## Local development

```bash
cd extension-wxt
bun run dev
```

This starts WXT dev mode and outputs a dev build for Chrome MV3.

## Production build

```bash
cd extension-wxt
WXT_WORKER_BASE_URL=https://your-worker.workers.dev \
WXT_DEV_KNOBS=false \
bun run build
```

## Zip for release

```bash
cd extension-wxt
WXT_WORKER_BASE_URL=https://your-worker.workers.dev \
WXT_DEV_KNOBS=false \
bun run zip
```

Expected artifact:

- `.output/*-chrome.zip`

## Load unpacked for manual verification

Use:

- `.output/chrome-mv3/`

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select `.output/chrome-mv3`

## Root release script

From repo root:

```bash
EXTENSION_BASE_URL=https://your-worker.workers.dev bun run release
```

This runs WXT zip and creates a GitHub release draft using the generated Chrome zip.
