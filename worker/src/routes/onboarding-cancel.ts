import { Result } from "better-result";
import { cancelOnboardingByPollToken } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { parseJsonBody, runDbOperation } from "../result-utils";
import type { Env } from "../types";

type OnboardingCancelBody = {
  poll_token?: string;
};

export async function handleOnboardingCancel(req: Request, env?: Env): Promise<Response> {
  if (!env?.DB) {
    const missing = new MissingBindingsError({ bindings: ["DB"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }

  const bodyResult = await parseJsonBody<OnboardingCancelBody>(req, "/api/onboarding/cancel");
  if (Result.isError(bodyResult)) {
    return Response.json(
      { error: bodyResult.error.message, error_type: bodyResult.error._tag },
      { status: 400 },
    );
  }

  const pollToken = bodyResult.value.poll_token?.trim() ?? "";
  if (!pollToken) {
    return Response.json({ error: "poll_token is required" }, { status: 400 });
  }

  const cancelResult = await runDbOperation("cancelOnboardingByPollToken", () =>
    cancelOnboardingByPollToken(env.DB!, pollToken),
  );
  if (Result.isError(cancelResult)) {
    return Response.json(
      { error: cancelResult.error.message, error_type: cancelResult.error._tag },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, cancelled: cancelResult.value });
}
