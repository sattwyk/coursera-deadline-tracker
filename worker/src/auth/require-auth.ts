import { Result } from "better-result";
import { hashToken } from "./token";
import { findAuthUserByTokenHash, touchTokenUsage } from "../db/repositories";
import { AuthProcessingError, DatabaseOperationError } from "../errors";
import type { AuthUser, Env } from "../types";

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export async function requireAuth(req: Request, env?: Env): Promise<AuthUser | Response> {
  if (!env) {
    return {
      id: "dev-user",
      telegramChatId: "dev-chat",
      name: "dev",
    };
  }
  if (!env.DB) {
    return Response.json({ error: "Missing required bindings: DB" }, { status: 500 });
  }
  const db = env.DB;

  const token = readBearerToken(req);
  if (!token) {
    return Response.json({ error: "missing bearer token" }, { status: 401 });
  }

  const tokenHashResult = await Result.tryPromise({
    try: () => hashToken(token),
    catch: (cause) => new AuthProcessingError({ cause }),
  });
  if (Result.isError(tokenHashResult)) {
    return Response.json(
      { error: tokenHashResult.error.message, error_type: tokenHashResult.error._tag },
      { status: 500 },
    );
  }

  const userResult = await Result.tryPromise({
    try: () => findAuthUserByTokenHash(db, tokenHashResult.value),
    catch: (cause) => new DatabaseOperationError({ operation: "findAuthUserByTokenHash", cause }),
  });
  if (Result.isError(userResult)) {
    return Response.json(
      { error: userResult.error.message, error_type: userResult.error._tag },
      { status: 500 },
    );
  }
  const user = userResult.value;
  if (!user) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const touchResult = await Result.tryPromise({
    try: () => touchTokenUsage(db, tokenHashResult.value),
    catch: (cause) => new DatabaseOperationError({ operation: "touchTokenUsage", cause }),
  });
  if (Result.isError(touchResult)) {
    return Response.json(
      { error: touchResult.error.message, error_type: touchResult.error._tag },
      { status: 500 },
    );
  }
  return user;
}
