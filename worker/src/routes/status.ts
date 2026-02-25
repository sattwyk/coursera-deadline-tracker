import { Result } from "better-result";
import { requireAuth } from "../auth/require-auth";
import { getLastFetchStatus } from "../db/repositories";
import { runDbOperation } from "../result-utils";
import type { Env } from "../types";

export async function handleStatus(req: Request, env?: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  if (!env?.DB) {
    return Response.json({
      last_run_at: null,
      last_run_status: null,
      tracked_items: 0,
    });
  }

  const stateResult = await runDbOperation("getLastFetchStatus", () =>
    getLastFetchStatus(env.DB!, auth.id),
  );
  if (Result.isError(stateResult)) {
    return Response.json(
      { error: stateResult.error.message, error_type: stateResult.error._tag },
      { status: 500 },
    );
  }
  const state = stateResult.value;
  return Response.json({
    last_run_at: state.lastRunAt,
    last_run_status: state.lastRunStatus,
    tracked_items: state.trackedItems,
  });
}
