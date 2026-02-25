import { handleCronFetch } from "./routes/cron";
import { handleDeadlines } from "./routes/deadlines";
import { handleFetchNow } from "./routes/fetch-now";
import { handleOnboardingCancel } from "./routes/onboarding-cancel";
import { handleOnboardingStart } from "./routes/onboarding-start";
import { handleOnboardingStatus } from "./routes/onboarding-status";
import { handleRegister } from "./routes/register";
import { handleSession } from "./routes/session";
import { handleStatus } from "./routes/status";
import { handleTelegramWebhook } from "./routes/telegram-webhook";
import type { Env } from "./types";

export default {
  async fetch(req: Request, env?: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/register") {
      return handleRegister(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/onboarding/start") {
      return handleOnboardingStart(req, env);
    }

    if (req.method === "GET" && url.pathname === "/api/onboarding/status") {
      return handleOnboardingStatus(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/onboarding/cancel") {
      return handleOnboardingCancel(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/session") {
      return handleSession(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/fetch-now") {
      return handleFetchNow(req, env);
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      return handleStatus(req, env);
    }

    if (req.method === "GET" && url.pathname === "/api/deadlines") {
      return handleDeadlines(req, env);
    }

    if (req.method === "POST" && url.pathname === "/api/telegram/webhook") {
      return handleTelegramWebhook(req, env);
    }

    if (req.method === "GET" && url.pathname === "/internal/cron/fetch") {
      return handleCronFetch(env);
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await handleCronFetch(env);
  },
};
