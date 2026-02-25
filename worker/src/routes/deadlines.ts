import { Result } from "better-result";
import { requireAuth } from "../auth/require-auth";
import { listCurrentDeadlines, type DeadlineFilter } from "../db/repositories";
import { runDbOperation } from "../result-utils";
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
  const filter = normalizeFilter(url.searchParams.get("filter"));
  const limitParam = Number(url.searchParams.get("limit") ?? 20);
  const offsetParam = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

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
