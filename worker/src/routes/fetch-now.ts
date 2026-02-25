import { Result } from "better-result";
import { requireAuth } from "../auth/require-auth";
import { runFetchNowForUser } from "../usecases/fetch-now";
import type { Env } from "../types";

export async function handleFetchNow(req: Request, env?: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const result = await Result.tryPromise(() =>
    runFetchNowForUser({
      env: env ?? {},
      userId: auth.id,
      telegramChatId: auth.telegramChatId,
      nowIso: new Date().toISOString(),
    }),
  );
  if (Result.isError(result)) {
    return Response.json(
      { ok: false, error: result.error.message, error_type: result.error._tag },
      { status: 500 },
    );
  }

  return Response.json(
    {
      ok: result.value.ok,
      run_id: result.value.runId,
      items_seen: result.value.itemsSeen,
      events_created: result.value.eventsCreated,
      error: result.value.error ?? null,
      error_type: result.value.errorType ?? null,
    },
    { status: result.value.ok ? 200 : 500 },
  );
}
