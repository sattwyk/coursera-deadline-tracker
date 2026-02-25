import { Result } from "better-result";
import { DatabaseOperationError, InvalidJsonBodyError } from "./errors";

export async function parseJsonBody<T>(
  req: Request,
  route: string,
): Promise<Result<T, InvalidJsonBodyError>> {
  return Result.tryPromise({
    try: () => req.json() as Promise<T>,
    catch: (cause) => new InvalidJsonBodyError({ route, cause }),
  });
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
