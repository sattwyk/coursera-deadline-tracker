import { Result } from "better-result";
import { cancelOnboardingByPollToken } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { parseJsonBodyWithSchema, runDbOperation } from "../result-utils";
import { onboardingCancelBodySchema } from "../schemas";
import type { Env } from "../types";

export async function handleOnboardingCancel(req: Request, env?: Env): Promise<Response> {
  if (!env?.DB) {
    const missing = new MissingBindingsError({ bindings: ["DB"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }

  const bodyResult = await parseJsonBodyWithSchema(
    req,
    "/api/onboarding/cancel",
    onboardingCancelBodySchema,
  );
  if (Result.isError(bodyResult)) {
    return Response.json(
      { error: bodyResult.error.message, error_type: bodyResult.error._tag },
      { status: 400 },
    );
  }

  const pollToken = bodyResult.value.poll_token;

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
