import { Result } from "better-result";
import { expireOnboardingLinks } from "../db/repositories";
import { runCronForAllUsers } from "../usecases/fetch-now";
import type { Env } from "../types";

export async function handleCronFetch(env?: Env): Promise<Response> {
  if (env?.DB) {
    await Result.tryPromise(() => expireOnboardingLinks(env.DB!));
  }

  const result = await Result.tryPromise(() =>
    runCronForAllUsers({
      env: env ?? {},
      nowIso: new Date().toISOString(),
    }),
  );
  if (Result.isError(result)) {
    return Response.json(
      { ok: false, error: result.error.message, error_type: result.error._tag },
      { status: 500 },
    );
  }
  return Response.json({
    ok: true,
    processed_users: result.value.processedUsers,
    success_count: result.value.successCount,
    error_count: result.value.errorCount,
  });
}
