#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
SMOKE_ONBOARDING="${SMOKE_ONBOARDING:-0}"

if [[ "${SMOKE_ONBOARDING}" == "1" ]]; then
  echo "0) onboarding-start"
  curl -sS -X POST "$BASE_URL/api/onboarding/start" \
    -H "content-type: application/json" \
    -d '{"name":"Smoke"}' >/tmp/onboarding-start.json
  POLL_TOKEN="$(sed -n 's/.*"poll_token":"\([^"]*\)".*/\1/p' /tmp/onboarding-start.json)"
  if [[ -z "${POLL_TOKEN}" ]]; then
    echo "Failed to parse poll_token from /tmp/onboarding-start.json"
    exit 1
  fi
  echo "0b) onboarding-status"
  curl -sS "$BASE_URL/api/onboarding/status?poll_token=${POLL_TOKEN}" >/tmp/onboarding-status.json
fi

echo "1) register"
curl -sS -X POST "$BASE_URL/api/register" \
  -H "content-type: application/json" \
  -d '{"name":"Smoke","telegram_chat_id":"123"}' >/tmp/register.json
TOKEN="$(sed -n 's/.*"api_token":"\([^"]*\)".*/\1/p' /tmp/register.json)"
if [[ -z "${TOKEN}" ]]; then
  echo "Failed to parse api_token from /tmp/register.json"
  exit 1
fi

echo "2) session"
curl -sS -X POST "$BASE_URL/api/session" \
  -H "content-type: application/json" \
  -H "authorization: Bearer ${TOKEN}" \
  -d '{"cookies":[{"name":"CAUTH","value":"x"}],"csrf3Token":"token","courseraUserId":1,"degreeIds":["base~x"]}' >/tmp/session.json

echo "3) fetch-now"
curl -sS -X POST "$BASE_URL/api/fetch-now" \
  -H "authorization: Bearer ${TOKEN}" >/tmp/fetch.json

echo "Smoke complete"
