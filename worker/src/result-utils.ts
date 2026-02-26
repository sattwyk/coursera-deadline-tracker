import { Result } from "better-result";
import type { z } from "zod";
import { DatabaseOperationError, InvalidInputSchemaError, InvalidJsonBodyError } from "./errors";

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

export async function parseJsonBody<T>(
  req: Request,
  route: string,
): Promise<Result<T, InvalidJsonBodyError>> {
  return Result.tryPromise({
    try: () => req.json() as Promise<T>,
    catch: (cause) => new InvalidJsonBodyError({ route, cause }),
  });
}

export async function parseJsonBodyWithSchema<T>(
  req: Request,
  route: string,
  schema: z.ZodType<T>,
): Promise<Result<T, InvalidJsonBodyError | InvalidInputSchemaError>> {
  const bodyResult = await parseJsonBody<unknown>(req, route);
  if (Result.isError(bodyResult)) return bodyResult;
  return parseWithSchema(bodyResult.value, route, "body", schema);
}

export function parseWithSchema<T>(
  value: unknown,
  route: string,
  source: "body" | "query" | "payload",
  schema: z.ZodType<T>,
): Result<T, InvalidInputSchemaError> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return Result.err(
      new InvalidInputSchemaError({
        route,
        source,
        issues: zodIssues(parsed.error),
      }),
    );
  }
  return Result.ok(parsed.data);
}

export async function runDbOperation<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<Result<T, DatabaseOperationError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) => new DatabaseOperationError({ operation, cause }),
  });
}
