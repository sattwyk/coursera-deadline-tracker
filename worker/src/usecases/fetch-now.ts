import { Result } from "better-result";
import { buildCalendarRequest, buildCookieHeader } from "../coursera/client";
import {
  acquireUserFetchLock,
  releaseUserFetchLock,
  finishFetchRun,
  getStoredDeadlines,
  getUserSettings,
  getUserTargets,
  listUsersForCron,
  markReauthRequired,
  replaceStoredDeadlines,
  startFetchRun,
  storeDeadlineEvents,
  type StoredDeadline,
} from "../db/repositories";
import { computeDeadlineEvents } from "../domain/diff";
import { normalizeCalendarItems, type NormalizedItem } from "../domain/normalize";
import {
  CourseraAuthExpiredError,
  CourseraFetchError,
  CourseraPayloadParseError,
  CourseraRequestError,
  FetchLockActiveError,
  FetchNowDatabaseError,
  type FetchNowError,
  MissingBindingsError,
  InvalidSessionPayloadError,
  SessionDecodeError,
  SessionNotFoundError,
  SessionStoreReadError,
} from "../errors";
import { formatDeadlineChangeMessage, sendTelegramMessage } from "../notify/telegram";
import { decodeSessionResult } from "../security/session-crypto";
import type { Env, FetchLike, SessionBundle } from "../types";

function toStored(item: NormalizedItem): StoredDeadline {
  return {
    stableKey: item.stableKey,
    deadlineAt: item.deadlineAt,
    isComplete: item.isComplete,
    kind: item.kind,
    courseId: item.courseId,
    courseName: item.courseName,
    title: item.title,
    url: item.url,
    rawJson: item.rawJson,
  };
}

function isTracked(
  item: Pick<NormalizedItem, "deadlineAt" | "isComplete">,
  nowIso: string,
): boolean {
  const deadline = Date.parse(item.deadlineAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(deadline)) return false;
  return !item.isComplete && deadline > now;
}

function toCourseraUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `https://www.coursera.org${url}`;
  return `https://www.coursera.org/${url}`;
}

async function fetchDegreeCalendar(input: {
  session: SessionBundle;
  degreeId: string;
  fetchImpl: FetchLike;
}): Promise<
  Result<
    unknown[],
    CourseraRequestError | CourseraAuthExpiredError | CourseraFetchError | CourseraPayloadParseError
  >
> {
  const request = buildCalendarRequest({
    courseraUserId: input.session.courseraUserId,
    degreeId: input.degreeId,
    csrf3Token: input.session.csrf3Token,
    cookieHeader: buildCookieHeader(input.session.cookies),
  });

  const responseResult = await Result.tryPromise({
    try: () => input.fetchImpl(request.url, request.init),
    catch: (cause) => new CourseraRequestError({ degreeId: input.degreeId, cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  if (responseResult.value.status === 401 || responseResult.value.status === 403) {
    return Result.err(
      new CourseraAuthExpiredError({
        degreeId: input.degreeId,
        status: responseResult.value.status,
      }),
    );
  }
  if (!responseResult.value.ok) {
    return Result.err(
      new CourseraFetchError({
        degreeId: input.degreeId,
        status: responseResult.value.status,
      }),
    );
  }

  const payloadResult = await Result.tryPromise({
    try: async () => (await responseResult.value.json()) as { calendarItems?: unknown },
    catch: (cause) => new CourseraPayloadParseError({ degreeId: input.degreeId, cause }),
  });
  if (Result.isError(payloadResult)) return payloadResult;

  const items = payloadResult.value.calendarItems;
  return Result.ok(Array.isArray(items) ? items : []);
}

export async function runFetchNow(input: {
  nowIso: string;
  previous: Array<{ stableKey: string; deadlineAt: string; isComplete: boolean }>;
  latestResponse: unknown[];
}) {
  const normalized = normalizeCalendarItems(input.latestResponse);

  const trackedLatest = normalized.filter((item) => isTracked(item, input.nowIso));
  const trackedLatestLite = trackedLatest.map((item) => ({
    stableKey: item.stableKey,
    deadlineAt: item.deadlineAt,
    isComplete: item.isComplete,
  }));

  const events = computeDeadlineEvents(input.previous, trackedLatestLite, input.nowIso);

  return {
    itemsSeen: trackedLatest.length,
    allNormalized: normalized,
    normalized: trackedLatest,
    events,
  };
}

async function runDb<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<Result<T, FetchNowDatabaseError>> {
  return Result.tryPromise({
    try: fn,
    catch: (cause) => new FetchNowDatabaseError({ operation, cause }),
  });
}

async function markReauthBestEffort(db: D1Database, userId: string): Promise<void> {
  await runDb("markReauthRequired", () => markReauthRequired(db, userId));
}

async function runFetchNowForUserResult(input: {
  env: Env;
  db: D1Database;
  sessions: KVNamespace;
  userId: string;
  telegramChatId: string;
  nowIso: string;
  fetchImpl: FetchLike;
  secret: string;
}): Promise<Result<{ itemsSeen: number; eventsCreated: number }, FetchNowError>> {
  const sessionPayloadResult = await Result.tryPromise({
    try: () => input.sessions.get(`session:${input.userId}`),
    catch: (cause) => new SessionStoreReadError({ userId: input.userId, cause }),
  });
  if (Result.isError(sessionPayloadResult)) return sessionPayloadResult;
  if (!sessionPayloadResult.value) {
    await markReauthBestEffort(input.db, input.userId);
    return Result.err(new SessionNotFoundError({ userId: input.userId }));
  }

  const sessionResult = await decodeSessionResult<SessionBundle>(
    sessionPayloadResult.value,
    input.secret,
  );
  if (Result.isError(sessionResult)) {
    if (InvalidSessionPayloadError.is(sessionResult.error)) return Result.err(sessionResult.error);
    return Result.err(new SessionDecodeError({ userId: input.userId, cause: sessionResult.error }));
  }

  const targetsResult = await runDb("getUserTargets", () => getUserTargets(input.db, input.userId));
  if (Result.isError(targetsResult)) return targetsResult;
  const targets = targetsResult.value ?? {
    courseraUserId: sessionResult.value.courseraUserId,
    degreeIds: sessionResult.value.degreeIds,
  };

  const allItems: unknown[] = [];
  for (const degreeId of targets.degreeIds) {
    const itemsResult = await fetchDegreeCalendar({
      session: { ...sessionResult.value, courseraUserId: targets.courseraUserId },
      degreeId,
      fetchImpl: input.fetchImpl,
    });
    if (Result.isError(itemsResult)) {
      if (CourseraAuthExpiredError.is(itemsResult.error)) {
        await markReauthBestEffort(input.db, input.userId);
      }
      return Result.err(itemsResult.error);
    }
    allItems.push(...itemsResult.value);
  }

  const previousStoredResult = await runDb("getStoredDeadlines", () =>
    getStoredDeadlines(input.db, input.userId),
  );
  if (Result.isError(previousStoredResult)) return previousStoredResult;
  const previousLite = previousStoredResult.value
    .filter((item) => isTracked(item, input.nowIso))
    .map((item) => ({
      stableKey: item.stableKey,
      deadlineAt: item.deadlineAt,
      isComplete: item.isComplete,
    }));

  const result = await runFetchNow({
    nowIso: input.nowIso,
    previous: previousLite,
    latestResponse: allItems,
  });

  const storedRows = result.allNormalized.map(toStored);
  const replaceStoredResult = await runDb("replaceStoredDeadlines", () =>
    replaceStoredDeadlines(input.db, input.userId, storedRows),
  );
  if (Result.isError(replaceStoredResult)) return replaceStoredResult;

  const eventsCreatedResult = await runDb("storeDeadlineEvents", () =>
    storeDeadlineEvents(input.db, input.userId, result.events),
  );
  if (Result.isError(eventsCreatedResult)) return eventsCreatedResult;

  if (input.env.TELEGRAM_BOT_TOKEN) {
    const settingsResult = await runDb("getUserSettings", () =>
      getUserSettings(input.db, input.userId),
    );
    if (Result.isError(settingsResult)) return settingsResult;
    const settings = settingsResult.value;
    const byKey = new Map(result.normalized.map((item) => [item.stableKey, item]));
    for (const event of result.events) {
      if (event.type === "removed") continue;
      if (settings.paused) continue;
      if (event.type === "new" && !settings.notifyNew) continue;
      if (event.type === "changed" && !settings.notifyChanged) continue;
      const item = byKey.get(event.stableKey);
      if (!item) continue;
      const text = formatDeadlineChangeMessage({
        eventType: event.type,
        courseName: item.courseName,
        title: item.title,
        oldDeadlineAt: event.oldDeadlineAt,
        newDeadlineAt: event.newDeadlineAt,
        timezone: settings.timezone,
        itemUrl: toCourseraUrl(item.url),
      });
      const sendResult = await sendTelegramMessage({
        botToken: input.env.TELEGRAM_BOT_TOKEN,
        chatId: input.telegramChatId,
        text,
        parseMode: "HTML",
        fetchImpl: input.fetchImpl,
      });
      if (Result.isError(sendResult)) return sendResult;
    }
  }

  return Result.ok({
    itemsSeen: result.itemsSeen,
    eventsCreated: eventsCreatedResult.value,
  });
}

export async function runFetchNowForUser(input: {
  env: Env;
  userId: string;
  telegramChatId: string;
  nowIso: string;
  fetchImpl?: FetchLike;
}): Promise<{
  runId: string;
  ok: boolean;
  itemsSeen: number;
  eventsCreated: number;
  error?: string;
  errorType?: string;
}> {
  const db = input.env.DB;
  const sessions = input.env.SESSIONS;
  const secret = input.env.SESSION_SECRET?.trim();
  if (!db || !sessions) {
    const err = new MissingBindingsError({
      bindings: [...(!db ? ["DB"] : []), ...(!sessions ? ["SESSIONS"] : [])],
    });
    return {
      runId: crypto.randomUUID(),
      ok: false,
      itemsSeen: 0,
      eventsCreated: 0,
      error: err.message,
      errorType: err._tag,
    };
  }
  if (!secret) {
    const err = new MissingBindingsError({ bindings: ["SESSION_SECRET"] });
    return {
      runId: crypto.randomUUID(),
      ok: false,
      itemsSeen: 0,
      eventsCreated: 0,
      error: err.message,
      errorType: err._tag,
    };
  }

  const lockExpiresAt = new Date(Date.parse(input.nowIso) + 5 * 60 * 1000).toISOString();
  const lockResult = await runDb("acquireUserFetchLock", () =>
    acquireUserFetchLock(db, {
      userId: input.userId,
      lockExpiresAt,
    }),
  );
  if (Result.isError(lockResult)) {
    return {
      runId: crypto.randomUUID(),
      ok: false,
      itemsSeen: 0,
      eventsCreated: 0,
      error: lockResult.error.message,
      errorType: lockResult.error._tag,
    };
  }
  if (!lockResult.value) {
    const err = new FetchLockActiveError({ userId: input.userId });
    return {
      runId: crypto.randomUUID(),
      ok: false,
      itemsSeen: 0,
      eventsCreated: 0,
      error: err.message,
      errorType: err._tag,
    };
  }

  try {
    const startRunResult = await runDb("startFetchRun", () => startFetchRun(db, input.userId));
    if (Result.isError(startRunResult)) {
      return {
        runId: crypto.randomUUID(),
        ok: false,
        itemsSeen: 0,
        eventsCreated: 0,
        error: startRunResult.error.message,
        errorType: startRunResult.error._tag,
      };
    }
    const runId = startRunResult.value;
    const fetchImpl: FetchLike =
      input.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

    const runResult = await runFetchNowForUserResult({
      env: input.env,
      db,
      sessions,
      userId: input.userId,
      telegramChatId: input.telegramChatId,
      nowIso: input.nowIso,
      fetchImpl,
      secret,
    });
    if (Result.isOk(runResult)) {
      await runDb("finishFetchRun(ok)", () =>
        finishFetchRun(db, {
          runId,
          result: {
            runId,
            status: "ok",
            itemsSeen: runResult.value.itemsSeen,
            errorMessage: null,
          },
        }),
      );
      return {
        runId,
        ok: true,
        itemsSeen: runResult.value.itemsSeen,
        eventsCreated: runResult.value.eventsCreated,
      };
    }

    await runDb("finishFetchRun(error)", () =>
      finishFetchRun(db, {
        runId,
        result: {
          runId,
          status: "error",
          itemsSeen: 0,
          errorMessage: runResult.error.message,
        },
      }),
    );
    return {
      runId,
      ok: false,
      itemsSeen: 0,
      eventsCreated: 0,
      error: runResult.error.message,
      errorType: runResult.error._tag,
    };
  } finally {
    await runDb("releaseUserFetchLock", () => releaseUserFetchLock(db, input.userId));
  }
}

export async function runCronForAllUsers(input: {
  env: Env;
  nowIso: string;
  fetchImpl?: FetchLike;
}): Promise<{ processedUsers: number; successCount: number; errorCount: number }> {
  const db = input.env.DB;
  if (!db) return { processedUsers: 0, successCount: 0, errorCount: 0 };

  const users = await listUsersForCron(db);
  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    const run = await runFetchNowForUser({
      env: input.env,
      userId: user.id,
      telegramChatId: user.telegramChatId,
      nowIso: input.nowIso,
      fetchImpl: input.fetchImpl,
    });
    if (run.ok) successCount += 1;
    else errorCount += 1;
  }

  return {
    processedUsers: users.length,
    successCount,
    errorCount,
  };
}
