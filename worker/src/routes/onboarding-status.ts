import { Result } from "better-result";
import { expireOnboardingLinks, getOnboardingByPollToken } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { runDbOperation } from "../result-utils";
import type { Env } from "../types";

export async function handleOnboardingStatus(req: Request, env?: Env): Promise<Response> {
  if (!env?.DB) {
    const missing = new MissingBindingsError({ bindings: ["DB"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }

  const url = new URL(req.url);
  const pollToken = url.searchParams.get("poll_token")?.trim() ?? "";
  if (!pollToken) {
    return Response.json({ error: "poll_token is required" }, { status: 400 });
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

  const onboardingResult = await runDbOperation("getOnboardingByPollToken", () =>
    getOnboardingByPollToken(env.DB!, pollToken),
  );
  if (Result.isError(onboardingResult)) {
    return Response.json(
      { error: onboardingResult.error.message, error_type: onboardingResult.error._tag },
      { status: 500 },
    );
  }

  const onboarding = onboardingResult.value;
  if (!onboarding) {
    return Response.json({ status: "expired" });
  }

  if (onboarding.status === "linked") {
    return Response.json({
      status: "linked",
      user_id: onboarding.userId,
      api_token: onboarding.apiToken,
      telegram_chat_id: onboarding.telegramChatId,
      name: onboarding.name,
      expires_at: onboarding.expiresAt,
      linked_at: onboarding.linkedAt,
    });
  }

  if (onboarding.status === "pending") {
    return Response.json({ status: "pending", expires_at: onboarding.expiresAt });
  }

  if (onboarding.status === "cancelled") {
    return Response.json({ status: "cancelled" });
  }

  return Response.json({ status: "expired" });
}
