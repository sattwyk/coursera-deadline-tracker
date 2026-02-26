# extension-wxt

Active Chrome MV3 extension workspace built with WXT + React + Tailwind + 8bit components.

## Scripts

```bash
bun run dev            # dev build/watch
bun run build          # production build into .output/chrome-mv3
bun run zip            # create .output/*-chrome.zip
bun run compile        # typecheck only
```

## Runtime env

- `WXT_WORKER_BASE_URL` - worker base URL used by popup/background API calls
- `WXT_DEV_KNOBS` - `true`/`false` to toggle popup dev knobs
