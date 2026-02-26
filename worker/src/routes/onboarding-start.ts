import { Result } from "better-result";
import { createOnboardingLink, expireOnboardingLinks } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { parseJsonBodyWithSchema, parseWithSchema, runDbOperation } from "../result-utils";
import {
  onboardingStartBodySchema,
  telegramGetMeSchema,
  type OnboardingStartBody,
} from "../schemas";
import type { Env } from "../types";

let cachedBotUsername: string | null = null;

function normalizeBotUsername(value: string): string {
  return value.trim().replace(/^@+/, "");
}

async function resolveBotUsername(env: Env): Promise<Result<string, Error>> {
  const configured = normalizeBotUsername(env.TELEGRAM_BOT_USERNAME ?? "");
  if (configured) return Result.ok(configured);
  if (cachedBotUsername) return Result.ok(cachedBotUsername);
  if (!env.TELEGRAM_BOT_TOKEN) return Result.err(new Error("TELEGRAM_BOT_TOKEN is missing"));

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`;
  const responseResult = await Result.tryPromise({
    try: () => fetch(url),
    catch: (cause) =>
      new Error(cause instanceof Error ? cause.message : "Failed to call Telegram getMe"),
  });
  if (Result.isError(responseResult)) return responseResult;
  if (!responseResult.value.ok) {
    return Result.err(new Error(`Telegram getMe failed with HTTP ${responseResult.value.status}`));
  }

  const jsonResult = await Result.tryPromise({
    try: () => responseResult.value.json() as Promise<unknown>,
    catch: (cause) =>
      new Error(cause instanceof Error ? cause.message : "Invalid Telegram getMe payload"),
  });
  if (Result.isError(jsonResult)) return jsonResult;

  const parsed = parseWithSchema(
    jsonResult.value,
    "telegram:getMe",
    "payload",
    telegramGetMeSchema,
  );
  if (Result.isError(parsed)) return Result.err(new Error(parsed.error.message));

  const username = normalizeBotUsername(parsed.value?.result?.username ?? "");
  if (!username) return Result.err(new Error("Telegram bot username missing in getMe response"));
  cachedBotUsername = username;
  return Result.ok(username);
}

export async function handleOnboardingStart(req: Request, env?: Env): Promise<Response> {
  if (!env?.DB) {
    const missing = new MissingBindingsError({ bindings: ["DB"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }

  const bodyResult = await parseJsonBodyWithSchema(
    req,
    "/api/onboarding/start",
    onboardingStartBodySchema,
  );
  if (Result.isError(bodyResult)) {
    return Response.json(
      { error: bodyResult.error.message, error_type: bodyResult.error._tag },
      { status: 400 },
    );
  }

  const expireResult = await runDbOperation("expireOnboardingLinks", () =>
    expireOnboardingLinks(env.DB!),
  );
  if (Result.isError(expireResult)) {
    return Response.json(
      { error: expireResult.error.message, error_type: expireResult.error._tag },
      { status: 500 },
    );
  }

  const createResult = await runDbOperation("createOnboardingLink", () =>
    createOnboardingLink(env.DB!, { name: bodyResult.value.name || undefined }),
  );
  if (Result.isError(createResult)) {
    return Response.json(
      { error: createResult.error.message, error_type: createResult.error._tag },
      { status: 500 },
    );
  }

  const usernameResult = await resolveBotUsername(env);
  if (Result.isError(usernameResult)) {
    return Response.json({ error: usernameResult.error.message }, { status: 500 });
  }

  const deepLink = `https://t.me/${usernameResult.value}?start=${encodeURIComponent(createResult.value.linkCode)}`;
  return Response.json({
    link_code: createResult.value.linkCode,
    telegram_deeplink_url: deepLink,
    expires_at: createResult.value.expiresAt,
    poll_token: createResult.value.pollToken,
  });
}
