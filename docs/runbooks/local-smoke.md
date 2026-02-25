# Local Smoke Runbook

## Prerequisites

- Start worker locally (`wrangler dev` from `worker/`)
- Configure required secrets (Telegram token, encryption key)
- Ensure D1 and KV bindings are present

## Run

```bash
bash scripts/e2e-smoke.sh
```

Optional onboarding API smoke:

```bash
SMOKE_ONBOARDING=1 bash scripts/e2e-smoke.sh
```

Use the onboarding variant only when Telegram bot token is configured for local worker.

## Expected

- (Optional) onboarding-start returns `poll_token`; onboarding-status returns pending/linked state
- Register call succeeds
- Session upload succeeds with bearer auth from returned token
- Fetch-now returns JSON response (success or explicit error body)
- Final output is `Smoke complete`

## Failure hints

- `401`: auth/session expired, reconnect Coursera in extension
- `400`: malformed payload from extension/session uploader
