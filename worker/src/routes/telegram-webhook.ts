import { Result } from "better-result";
import {
  createOrGetUserAndToken,
  expireOnboardingLinks,
  getLastFetchStatus,
  getPendingOnboardingByLinkCode,
  getUserByTelegramChatId,
  getUserSettings,
  markOnboardingLinked,
  setUserNotifyMode,
  setUserPaused,
  setUserTimezone,
} from "../db/repositories";
import { escapeTelegramHtml, sendTelegramMessage } from "../notify/telegram";
import { parseJsonBody, runDbOperation } from "../result-utils";
import { buildHelpText, isValidTimezone, parseTelegramCommand } from "../telegram/commands";
import type { Env } from "../types";
import { runFetchNowForUser } from "../usecases/fetch-now";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number | string };
  };
  edited_message?: {
    text?: string;
    chat?: { id: number | string };
  };
};

function getUpdateMessage(update: TelegramUpdate): { text: string; chatId: string } | null {
  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const text = typeof msg?.text === "string" ? msg.text.trim() : "";
  return {
    text,
    chatId: String(chatId),
  };
}

function buildSettingsSummary(input: {
  paused: boolean;
  notifyNew: boolean;
  notifyChanged: boolean;
  timezone: string;
}): string {
  const mode =
    input.notifyNew && input.notifyChanged
      ? "all"
      : input.notifyNew
        ? "new"
        : input.notifyChanged
          ? "changed"
          : "none";
  return [
    "<b>Current settings</b>",
    `paused: <code>${input.paused ? "yes" : "no"}</code>`,
    `mode: <code>${mode}</code>`,
    `timezone: <code>${escapeTelegramHtml(input.timezone)}</code>`,
  ].join("\n");
}

async function replyHtml(env: Env, chatId: string, text: string): Promise<Result<void, Error>> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return Result.err(new Error("TELEGRAM_BOT_TOKEN missing"));
  }
  const sendResult = await sendTelegramMessage({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId,
    text,
    parseMode: "HTML",
  });
  if (Result.isError(sendResult)) {
    return Result.err(new Error(sendResult.error.message));
  }
  return Result.ok();
}

async function handleStartLinkCommand(
  env: Env,
  input: { chatId: string; linkCode: string },
): Promise<Result<{ handled: string }, Error>> {
  const db = env.DB;
  if (!db) return Result.err(new Error("DB binding missing"));

  const expireResult = await runDbOperation("expireOnboardingLinks", () => expireOnboardingLinks(db));
  if (Result.isError(expireResult)) return Result.err(new Error(expireResult.error.message));

  const onboardingResult = await runDbOperation("getPendingOnboardingByLinkCode", () =>
    getPendingOnboardingByLinkCode(db, input.linkCode),
  );
  if (Result.isError(onboardingResult)) return Result.err(new Error(onboardingResult.error.message));

  const onboarding = onboardingResult.value;
  if (!onboarding) {
    const reply = await replyHtml(
      env,
      input.chatId,
      "This setup link is invalid or expired. Open the extension and generate a new link.",
    );
    if (Result.isError(reply)) return Result.err(reply.error);
    return Result.ok({ handled: "invalid-onboarding-link" });
  }

  const createResult = await runDbOperation("createOrGetUserAndToken", () =>
    createOrGetUserAndToken(db, {
      name: onboarding.name?.trim() || "Coursera User",
      telegramChatId: input.chatId,
    }),
  );
  if (Result.isError(createResult)) return Result.err(new Error(createResult.error.message));

  const markResult = await runDbOperation("markOnboardingLinked", () =>
    markOnboardingLinked(db, {
      onboardingId: onboarding.id,
      userId: createResult.value.userId,
      telegramChatId: input.chatId,
      apiToken: createResult.value.token,
    }),
  );
  if (Result.isError(markResult)) return Result.err(new Error(markResult.error.message));

  const reply = await replyHtml(
    env,
    input.chatId,
    [
      "<b>Telegram connected</b>",
      "Return to the extension. It will finish Coursera connection automatically.",
      "",
      "If it does not finish, open your Coursera degree page once and refresh.",
    ].join("\n"),
  );
  if (Result.isError(reply)) return Result.err(reply.error);

  return Result.ok({ handled: "onboarding-linked" });
}

export async function handleTelegramWebhook(req: Request, env?: Env): Promise<Response> {
  const webhookSecret = env?.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== webhookSecret) {
      return Response.json({ ok: false, error: "invalid webhook secret" }, { status: 401 });
    }
  }

  if (!env?.DB || !env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ ok: true, warning: "missing DB or TELEGRAM_BOT_TOKEN binding" });
  }

  const updateResult = await parseJsonBody<TelegramUpdate>(req, "/api/telegram/webhook");
  if (Result.isError(updateResult)) {
    return Response.json(
      { ok: false, error: updateResult.error.message, error_type: updateResult.error._tag },
      { status: 400 },
    );
  }
  const update = updateResult.value;
  const incoming = getUpdateMessage(update);
  if (!incoming) return Response.json({ ok: true, ignored: "no-message" });

  const command = parseTelegramCommand(incoming.text);
  if (!command) return Response.json({ ok: true, ignored: "no-command" });

  if (command.kind === "start" && command.payload) {
    const startResult = await handleStartLinkCommand(env, {
      chatId: incoming.chatId,
      linkCode: command.payload,
    });
    if (Result.isError(startResult)) {
      return Response.json({ ok: false, error: startResult.error.message }, { status: 500 });
    }
    return Response.json({ ok: true, handled: startResult.value.handled });
  }

  const userResult = await runDbOperation("getUserByTelegramChatId", () =>
    getUserByTelegramChatId(env.DB!, incoming.chatId),
  );
  if (Result.isError(userResult)) {
    return Response.json(
      { ok: false, error: userResult.error.message, error_type: userResult.error._tag },
      { status: 500 },
    );
  }
  const user = userResult.value;
  if (!user) {
    const unregisteredResult = await replyHtml(
      env,
      incoming.chatId,
      [
        "You are not linked yet.",
        "Open the extension and tap <b>Connect Telegram</b> to generate a secure link.",
      ].join("\n"),
    );
    if (Result.isError(unregisteredResult)) {
      return Response.json({ ok: false, error: unregisteredResult.error.message }, { status: 502 });
    }
    return Response.json({ ok: true, handled: "unregistered" });
  }

  let reply = "";
  if (command.kind === "start" || command.kind === "help") {
    reply = buildHelpText();
  } else if (command.kind === "status" || command.kind === "settings") {
    const statusResult = await runDbOperation("getLastFetchStatus", () =>
      getLastFetchStatus(env.DB!, user.id),
    );
    if (Result.isError(statusResult)) {
      return Response.json(
        { ok: false, error: statusResult.error.message, error_type: statusResult.error._tag },
        { status: 500 },
      );
    }
    const settingsResult = await runDbOperation("getUserSettings", () =>
      getUserSettings(env.DB!, user.id),
    );
    if (Result.isError(settingsResult)) {
      return Response.json(
        { ok: false, error: settingsResult.error.message, error_type: settingsResult.error._tag },
        { status: 500 },
      );
    }
    const status = statusResult.value;
    const settings = settingsResult.value;
    reply = [
      "<b>Status</b>",
      `last_run_status: <code>${escapeTelegramHtml(status.lastRunStatus ?? "none")}</code>`,
      `last_run_at: <code>${escapeTelegramHtml(status.lastRunAt ?? "none")}</code>`,
      `tracked_items: <code>${status.trackedItems}</code>`,
      `reauth_required: <code>${user.reauthRequired ? "yes" : "no"}</code>`,
      "",
      buildSettingsSummary(settings),
    ].join("\n");
  } else if (command.kind === "pause") {
    const pauseResult = await runDbOperation("setUserPaused(true)", () =>
      setUserPaused(env.DB!, user.id, true),
    );
    if (Result.isError(pauseResult)) {
      return Response.json(
        { ok: false, error: pauseResult.error.message, error_type: pauseResult.error._tag },
        { status: 500 },
      );
    }
    reply = "Notifications paused. Use <code>/resume</code> to enable again.";
  } else if (command.kind === "resume") {
    const resumeResult = await runDbOperation("setUserPaused(false)", () =>
      setUserPaused(env.DB!, user.id, false),
    );
    if (Result.isError(resumeResult)) {
      return Response.json(
        { ok: false, error: resumeResult.error.message, error_type: resumeResult.error._tag },
        { status: 500 },
      );
    }
    reply = "Notifications resumed.";
  } else if (command.kind === "mode") {
    if (!command.mode) {
      reply = "Usage: <code>/mode &lt;all|new|changed|none&gt;</code>";
    } else {
      const mode = command.mode;
      const modeResult = await runDbOperation("setUserNotifyMode", () =>
        setUserNotifyMode(env.DB!, user.id, mode),
      );
      if (Result.isError(modeResult)) {
        return Response.json(
          { ok: false, error: modeResult.error.message, error_type: modeResult.error._tag },
          { status: 500 },
        );
      }
      reply = `Notification mode updated to: <code>${escapeTelegramHtml(mode)}</code>`;
    }
  } else if (command.kind === "timezone") {
    if (!command.timezone) {
      reply = "Usage: <code>/tz &lt;IANA timezone&gt;</code> (example: <code>/tz Asia/Kolkata</code>)";
    } else if (!isValidTimezone(command.timezone)) {
      reply = `Invalid timezone: <code>${escapeTelegramHtml(command.timezone)}</code>`;
    } else {
      const timezone = command.timezone;
      const tzResult = await runDbOperation("setUserTimezone", () =>
        setUserTimezone(env.DB!, user.id, timezone),
      );
      if (Result.isError(tzResult)) {
        return Response.json(
          { ok: false, error: tzResult.error.message, error_type: tzResult.error._tag },
          { status: 500 },
        );
      }
      reply = `Timezone updated to: <code>${escapeTelegramHtml(timezone)}</code>`;
    }
  } else if (command.kind === "sync") {
    const out = await runFetchNowForUser({
      env,
      userId: user.id,
      telegramChatId: user.telegramChatId,
      nowIso: new Date().toISOString(),
    });
    reply = out.ok
      ? `Sync complete.\nitems_seen: <code>${out.itemsSeen}</code>\nevents_created: <code>${out.eventsCreated}</code>`
      : `Sync failed: <code>${escapeTelegramHtml(out.error ?? "unknown error")}</code>`;
  } else if (command.kind === "test") {
    reply = `Test OK at <code>${new Date().toISOString()}</code>`;
  } else {
    reply = `Unknown command: <code>/${escapeTelegramHtml(command.raw)}</code>\n\n${buildHelpText()}`;
  }

  const replyResult = await replyHtml(env, incoming.chatId, reply);
  if (Result.isError(replyResult)) {
    return Response.json({ ok: false, error: replyResult.error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
