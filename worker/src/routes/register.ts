import { Result } from "better-result";
import { createOrGetUserAndToken } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { parseJsonBodyWithSchema, runDbOperation } from "../result-utils";
import { registerBodySchema } from "../schemas";
import type { Env } from "../types";

export async function handleRegister(req: Request, env?: Env): Promise<Response> {
  const bodyResult = await parseJsonBodyWithSchema(req, "/api/register", registerBodySchema);
  if (Result.isError(bodyResult)) {
    return Response.json(
      { error: bodyResult.error.message, error_type: bodyResult.error._tag },
      { status: 400 },
    );
  }
  const body = bodyResult.value;

  if (!env) {
    return Response.json({
      user_id: crypto.randomUUID(),
      api_token: crypto.randomUUID().replace(/-/g, ""),
      name: body.name,
      telegram_chat_id: body.telegram_chat_id,
      warning: "DB binding missing, using fallback response",
    });
  }
  if (!env.DB) {
    const missing = new MissingBindingsError({ bindings: ["DB"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }
  const db = env.DB;

  const createdResult = await runDbOperation("createOrGetUserAndToken", () =>
    createOrGetUserAndToken(db, {
      name: body.name,
      telegramChatId: body.telegram_chat_id,
    }),
  );
  if (Result.isError(createdResult)) {
    return Response.json(
      { error: createdResult.error.message, error_type: createdResult.error._tag },
      { status: 500 },
    );
  }

  return Response.json({
    user_id: createdResult.value.userId,
    api_token: createdResult.value.token,
  });
}
