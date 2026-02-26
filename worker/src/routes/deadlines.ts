import { Result } from "better-result";
import { requireAuth } from "../auth/require-auth";
import { listCurrentDeadlines, type DeadlineFilter } from "../db/repositories";
import { parseWithSchema, runDbOperation } from "../result-utils";
import { deadlinesQuerySchema } from "../schemas";
import type { Env } from "../types";

const DEADLINE_FILTERS: DeadlineFilter[] = ["pending", "completed", "upcoming", "overdue", "all"];

function normalizeFilter(raw: string | null): DeadlineFilter {
  const normalized = raw?.trim().toLowerCase() ?? "upcoming";
  if (normalized === "everything") return "all";
  return DEADLINE_FILTERS.includes(normalized as DeadlineFilter)
    ? (normalized as DeadlineFilter)
    : "upcoming";
}

export async function handleDeadlines(req: Request, env?: Env): Promise<Response> {
  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  if (!env?.DB) {
    return Response.json({
      filter: "upcoming",
      count: 0,
      items: [],
    });
  }

  const url = new URL(req.url);
  const queryResult = parseWithSchema(
    Object.fromEntries(url.searchParams.entries()),
    "/api/deadlines",
    "query",
    deadlinesQuerySchema,
  );
  if (Result.isError(queryResult)) {
    return Response.json(
      { error: queryResult.error.message, error_type: queryResult.error._tag },
      { status: 400 },
    );
  }
  const filter = normalizeFilter(queryResult.value.filter ?? null);
  const limit = queryResult.value.limit;
  const offset = queryResult.value.offset;

  const itemsResult = await runDbOperation("listCurrentDeadlines", () =>
    listCurrentDeadlines(env.DB!, {
      userId: auth.id,
      filter,
      limit,
      offset,
    }),
  );
  if (Result.isError(itemsResult)) {
    return Response.json(
      { error: itemsResult.error.message, error_type: itemsResult.error._tag },
      { status: 500 },
    );
  }

  return Response.json({
    filter,
    offset,
    count: itemsResult.value.length,
    items: itemsResult.value,
  });
}
