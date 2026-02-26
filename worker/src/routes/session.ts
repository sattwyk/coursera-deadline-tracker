import { Result } from "better-result";
import { requireAuth } from "../auth/require-auth";
import { replaceUserDegreeTargets } from "../db/repositories";
import { MissingBindingsError } from "../errors";
import { SessionEncodeError, SessionStoreWriteError } from "../errors";
import { parseJsonBodyWithSchema, runDbOperation } from "../result-utils";
import { sessionBodySchema } from "../schemas";
import { encodeSession } from "../security/session-crypto";
import type { Env, SessionBundle } from "../types";

export async function handleSession(req: Request, env?: Env): Promise<Response> {
  if (env && !env.SESSIONS) {
    const missing = new MissingBindingsError({ bindings: ["SESSIONS"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }
  if (env && !env.SESSION_SECRET) {
    const missing = new MissingBindingsError({ bindings: ["SESSION_SECRET"] });
    return Response.json({ error: missing.message, error_type: missing._tag }, { status: 500 });
  }

  const auth = await requireAuth(req, env);
  if (auth instanceof Response) return auth;

  const bodyResult = await parseJsonBodyWithSchema(req, "/api/session", sessionBodySchema);
  if (Result.isError(bodyResult)) {
    return Response.json(
      { error: bodyResult.error.message, error_type: bodyResult.error._tag },
      { status: 400 },
    );
  }
  const body = bodyResult.value;

  const session: SessionBundle = {
    cookies: body.cookies,
    csrf3Token: body.csrf3Token,
    courseraUserId: body.courseraUserId,
    degreeIds: body.degreeIds,
    capturedAt: new Date().toISOString(),
  };

  const secret = env?.SESSION_SECRET ?? "dev-session-secret";
  const encodedResult = await Result.tryPromise({
    try: () => encodeSession(session, secret),
    catch: (cause) => new SessionEncodeError({ cause }),
  });
  if (Result.isError(encodedResult)) {
    return Response.json(
      { error: encodedResult.error.message, error_type: encodedResult.error._tag },
      { status: 500 },
    );
  }
  const encoded = encodedResult.value;

  if (env?.SESSIONS) {
    const putResult = await Result.tryPromise({
      try: () => env.SESSIONS!.put(`session:${auth.id}`, encoded),
      catch: (cause) => new SessionStoreWriteError({ userId: auth.id, cause }),
    });
    if (Result.isError(putResult)) {
      return Response.json(
        { error: putResult.error.message, error_type: putResult.error._tag },
        { status: 500 },
      );
    }
  }
  if (env?.DB) {
    const targetsResult = await runDbOperation("replaceUserDegreeTargets", () =>
      replaceUserDegreeTargets(env.DB!, {
        userId: auth.id,
        courseraUserId: session.courseraUserId,
        degreeIds: session.degreeIds,
      }),
    );
    if (Result.isError(targetsResult)) {
      return Response.json(
        { error: targetsResult.error.message, error_type: targetsResult.error._tag },
        { status: 500 },
      );
    }
  }

  return Response.json({ ok: true, encoded_size: encoded.length });
}
