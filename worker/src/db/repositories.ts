import { hashToken, makeToken } from "../auth/token";
import type { AuthUser, UserSettings } from "../types";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  reauth_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_degree_targets (
  user_id TEXT NOT NULL,
  coursera_user_id INTEGER NOT NULL,
  degree_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, degree_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deadlines_current (
  user_id TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  title TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  url TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, stable_key)
);

CREATE TABLE IF NOT EXISTS deadline_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_deadline_at TEXT,
  new_deadline_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deadline_events_dedupe
ON deadline_events(user_id, stable_key, event_type, IFNULL(new_deadline_at, ""));

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  items_seen INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS fetch_locks (
  user_id TEXT PRIMARY KEY,
  lock_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  paused INTEGER NOT NULL DEFAULT 0,
  notify_new INTEGER NOT NULL DEFAULT 1,
  notify_changed INTEGER NOT NULL DEFAULT 1,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS onboarding_links (
  id TEXT PRIMARY KEY,
  link_code_hash TEXT NOT NULL UNIQUE,
  poll_token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  telegram_chat_id TEXT,
  user_id TEXT,
  api_token TEXT,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  linked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

export type StoredDeadline = {
  stableKey: string;
  deadlineAt: string;
  isComplete: boolean;
  kind: "assignment" | "event";
  courseId: string;
  courseName: string;
  title: string;
  url: string;
  rawJson: string;
};

export type FetchRunResult = {
  runId: string;
  status: "ok" | "error";
  itemsSeen: number;
  errorMessage: string | null;
};

export type NotifyMode = "all" | "new" | "changed" | "none";
export type OnboardingStatus = "pending" | "linked" | "expired" | "cancelled";

export type OnboardingLink = {
  id: string;
  status: OnboardingStatus;
  name: string | null;
  userId: string | null;
  telegramChatId: string | null;
  apiToken: string | null;
  expiresAt: string;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function ensureSchema(db: D1Database): Promise<void> {
  const statements = SCHEMA_SQL.split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

export async function createOrGetUserAndToken(
  db: D1Database,
  input: { name: string; telegramChatId: string },
): Promise<{ userId: string; token: string }> {
  await ensureSchema(db);
  const existing = await db
    .prepare("SELECT id FROM users WHERE telegram_chat_id = ?1 LIMIT 1")
    .bind(input.telegramChatId)
    .first<{ id: string }>();

  const userId = existing?.id ?? crypto.randomUUID();
  const ts = nowIso();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO users (id, telegram_chat_id, name, is_active, reauth_required, created_at, updated_at) VALUES (?1, ?2, ?3, 1, 0, ?4, ?4)",
      )
      .bind(userId, input.telegramChatId, input.name, ts)
      .run();
    await db
      .prepare(
        "INSERT OR IGNORE INTO user_settings (user_id, paused, notify_new, notify_changed, timezone, updated_at) VALUES (?1, 0, 1, 1, 'UTC', ?2)",
      )
      .bind(userId, ts)
      .run();
  } else {
    await db
      .prepare("UPDATE users SET name = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(input.name, ts, userId)
      .run();
  }

  const token = makeToken();
  const tokenHash = await hashToken(token);
  await db
    .prepare(
      "INSERT OR REPLACE INTO api_tokens (token_hash, user_id, created_at, last_used_at) VALUES (?1, ?2, ?3, NULL)",
    )
    .bind(tokenHash, userId, ts)
    .run();

  return { userId, token };
}

export async function findAuthUserByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<AuthUser | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      "SELECT u.id as id, u.telegram_chat_id as telegramChatId, u.name as name FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?1 AND u.is_active = 1 LIMIT 1",
    )
    .bind(tokenHash)
    .first<AuthUser>();
  return row ?? null;
}

export async function touchTokenUsage(db: D1Database, tokenHash: string): Promise<void> {
  await db
    .prepare("UPDATE api_tokens SET last_used_at = ?1 WHERE token_hash = ?2")
    .bind(nowIso(), tokenHash)
    .run();
}

function addSecondsToIso(baseIso: string, seconds: number): string {
  return new Date(Date.parse(baseIso) + seconds * 1000).toISOString();
}

type OnboardingLinkRow = {
  id: string;
  status: OnboardingStatus;
  name: string | null;
  userId: string | null;
  telegramChatId: string | null;
  apiToken: string | null;
  expiresAt: string;
  linkedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toOnboardingLink(row: OnboardingLinkRow): OnboardingLink {
  return {
    id: row.id,
    status: row.status,
    name: row.name,
    userId: row.userId,
    telegramChatId: row.telegramChatId,
    apiToken: row.apiToken,
    expiresAt: row.expiresAt,
    linkedAt: row.linkedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createOnboardingLink(
  db: D1Database,
  input?: { name?: string; ttlSeconds?: number },
): Promise<{ linkCode: string; pollToken: string; expiresAt: string }> {
  await ensureSchema(db);
  const ts = nowIso();
  const ttlSeconds = Math.max(60, input?.ttlSeconds ?? 15 * 60);
  const linkCode = makeToken().slice(0, 32);
  const pollToken = makeToken();
  const linkCodeHash = await hashToken(linkCode);
  const pollTokenHash = await hashToken(pollToken);
  const expiresAt = addSecondsToIso(ts, ttlSeconds);

  await db
    .prepare(
      "INSERT INTO onboarding_links (id, link_code_hash, poll_token_hash, name, telegram_chat_id, user_id, api_token, status, expires_at, linked_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, NULL, NULL, 'pending', ?5, NULL, ?6, ?6)",
    )
    .bind(crypto.randomUUID(), linkCodeHash, pollTokenHash, input?.name ?? null, expiresAt, ts)
    .run();

  return { linkCode, pollToken, expiresAt };
}

export async function expireOnboardingLinks(db: D1Database, now: string = nowIso()): Promise<number> {
  await ensureSchema(db);
  const out = await db
    .prepare(
      "UPDATE onboarding_links SET status = 'expired', updated_at = ?1 WHERE status = 'pending' AND expires_at <= ?2",
    )
    .bind(now, now)
    .run();
  return Number(out.meta?.changes ?? 0);
}

export async function getOnboardingByPollToken(
  db: D1Database,
  pollToken: string,
): Promise<OnboardingLink | null> {
  await ensureSchema(db);
  const pollTokenHash = await hashToken(pollToken);
  const row = await db
    .prepare(
      "SELECT id, status, name, user_id as userId, telegram_chat_id as telegramChatId, api_token as apiToken, expires_at as expiresAt, linked_at as linkedAt, created_at as createdAt, updated_at as updatedAt FROM onboarding_links WHERE poll_token_hash = ?1 LIMIT 1",
    )
    .bind(pollTokenHash)
    .first<OnboardingLinkRow>();
  return row ? toOnboardingLink(row) : null;
}

export async function getPendingOnboardingByLinkCode(
  db: D1Database,
  linkCode: string,
): Promise<OnboardingLink | null> {
  await ensureSchema(db);
  const linkCodeHash = await hashToken(linkCode);
  const row = await db
    .prepare(
      "SELECT id, status, name, user_id as userId, telegram_chat_id as telegramChatId, api_token as apiToken, expires_at as expiresAt, linked_at as linkedAt, created_at as createdAt, updated_at as updatedAt FROM onboarding_links WHERE link_code_hash = ?1 AND status = 'pending' LIMIT 1",
    )
    .bind(linkCodeHash)
    .first<OnboardingLinkRow>();
  return row ? toOnboardingLink(row) : null;
}

export async function markOnboardingLinked(
  db: D1Database,
  input: {
    onboardingId: string;
    userId: string;
    telegramChatId: string;
    apiToken: string;
  },
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      "UPDATE onboarding_links SET status = 'linked', user_id = ?1, telegram_chat_id = ?2, api_token = ?3, linked_at = ?4, updated_at = ?4 WHERE id = ?5",
    )
    .bind(input.userId, input.telegramChatId, input.apiToken, ts, input.onboardingId)
    .run();
}

export async function cancelOnboardingByPollToken(
  db: D1Database,
  pollToken: string,
): Promise<boolean> {
  await ensureSchema(db);
  const pollTokenHash = await hashToken(pollToken);
  const ts = nowIso();
  const out = await db
    .prepare(
      "UPDATE onboarding_links SET status = 'cancelled', updated_at = ?1 WHERE poll_token_hash = ?2 AND status = 'pending'",
    )
    .bind(ts, pollTokenHash)
    .run();
  return Number(out.meta?.changes ?? 0) > 0;
}

export async function replaceUserDegreeTargets(
  db: D1Database,
  input: { userId: string; courseraUserId: number; degreeIds: string[] },
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM user_degree_targets WHERE user_id = ?1").bind(input.userId),
  ];
  for (const degreeId of input.degreeIds) {
    statements.push(
      db
        .prepare(
          "INSERT INTO user_degree_targets (user_id, coursera_user_id, degree_id, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, 1, ?4, ?4)",
        )
        .bind(input.userId, input.courseraUserId, degreeId, ts),
    );
  }
  statements.push(
    db.prepare("UPDATE users SET reauth_required = 0, updated_at = ?1 WHERE id = ?2").bind(ts, input.userId),
  );
  await db.batch(statements);
}

export async function getUserTargets(
  db: D1Database,
  userId: string,
): Promise<{ courseraUserId: number; degreeIds: string[] } | null> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      "SELECT coursera_user_id as courseraUserId, degree_id as degreeId FROM user_degree_targets WHERE user_id = ?1 AND is_active = 1 ORDER BY degree_id",
    )
    .bind(userId)
    .all<{ courseraUserId: number; degreeId: string }>();

  const list = rows.results ?? [];
  if (list.length === 0) return null;

  return {
    courseraUserId: list[0].courseraUserId,
    degreeIds: list.map((r) => r.degreeId),
  };
}

export async function getStoredDeadlines(
  db: D1Database,
  userId: string,
): Promise<StoredDeadline[]> {
  await ensureSchema(db);
  type StoredDeadlineRow = Omit<StoredDeadline, "isComplete"> & { isComplete: number };
  const rows = await db
    .prepare(
      "SELECT stable_key as stableKey, deadline_at as deadlineAt, is_complete as isComplete, kind, course_id as courseId, course_name as courseName, title, url, raw_json as rawJson FROM deadlines_current WHERE user_id = ?1",
    )
    .bind(userId)
    .all<StoredDeadlineRow>();

  return (rows.results ?? []).map((row) => ({
    stableKey: row.stableKey,
    deadlineAt: row.deadlineAt,
    isComplete: Boolean(row.isComplete),
    kind: row.kind,
    courseId: row.courseId,
    courseName: row.courseName,
    title: row.title,
    url: row.url,
    rawJson: row.rawJson,
  }));
}

export async function replaceStoredDeadlines(
  db: D1Database,
  userId: string,
  deadlines: StoredDeadline[],
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM deadlines_current WHERE user_id = ?1").bind(userId),
  ];
  for (const item of deadlines) {
    statements.push(
      db
        .prepare(
          "INSERT INTO deadlines_current (user_id, stable_key, kind, course_id, course_name, title, deadline_at, url, is_complete, raw_json, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(
          userId,
          item.stableKey,
          item.kind,
          item.courseId,
          item.courseName,
          item.title,
          item.deadlineAt,
          item.url,
          item.isComplete ? 1 : 0,
          item.rawJson,
          ts,
        ),
    );
  }
  await db.batch(statements);
}

export async function storeDeadlineEvents(
  db: D1Database,
  userId: string,
  events: Array<{
    type: "new" | "changed" | "removed";
    stableKey: string;
    oldDeadlineAt: string | null;
    newDeadlineAt: string | null;
  }>,
): Promise<number> {
  await ensureSchema(db);
  const ts = nowIso();
  let inserted = 0;
  for (const event of events) {
    const res = await db
      .prepare(
        "INSERT OR IGNORE INTO deadline_events (id, user_id, stable_key, event_type, old_deadline_at, new_deadline_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      )
      .bind(
        crypto.randomUUID(),
        userId,
        event.stableKey,
        event.type,
        event.oldDeadlineAt,
        event.newDeadlineAt,
        ts,
      )
      .run();
    inserted += Number(res.meta?.changes ?? 0);
  }
  return inserted;
}

export async function markReauthRequired(db: D1Database, userId: string): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("UPDATE users SET reauth_required = 1, updated_at = ?1 WHERE id = ?2")
    .bind(nowIso(), userId)
    .run();
}

export async function startFetchRun(db: D1Database, userId: string): Promise<string> {
  await ensureSchema(db);
  const runId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO fetch_runs (id, user_id, started_at, status, items_seen, error_message) VALUES (?1, ?2, ?3, 'running', 0, NULL)",
    )
    .bind(runId, userId, nowIso())
    .run();
  return runId;
}

export async function acquireUserFetchLock(
  db: D1Database,
  input: { userId: string; lockExpiresAt: string },
): Promise<boolean> {
  await ensureSchema(db);
  const now = nowIso();
  const res = await db
    .prepare(
      "INSERT INTO fetch_locks (user_id, lock_expires_at, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET lock_expires_at = excluded.lock_expires_at, updated_at = excluded.updated_at WHERE fetch_locks.lock_expires_at <= ?4",
    )
    .bind(input.userId, input.lockExpiresAt, now, now)
    .run();

  return Number(res.meta?.changes ?? 0) > 0;
}

export async function releaseUserFetchLock(db: D1Database, userId: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM fetch_locks WHERE user_id = ?1").bind(userId).run();
}

export async function finishFetchRun(
  db: D1Database,
  input: { runId: string; result: FetchRunResult },
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(
      "UPDATE fetch_runs SET finished_at = ?1, status = ?2, items_seen = ?3, error_message = ?4 WHERE id = ?5",
    )
    .bind(
      nowIso(),
      input.result.status,
      input.result.itemsSeen,
      input.result.errorMessage,
      input.runId,
    )
    .run();
}

export async function getLastFetchStatus(
  db: D1Database,
  userId: string,
): Promise<{ lastRunAt: string | null; lastRunStatus: string | null; trackedItems: number }> {
  await ensureSchema(db);
  const lastRun = await db
    .prepare(
      "SELECT finished_at as finishedAt, status FROM fetch_runs WHERE user_id = ?1 ORDER BY started_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<{ finishedAt: string | null; status: string | null }>();

  const countRow = await db
    .prepare("SELECT COUNT(*) as count FROM deadlines_current WHERE user_id = ?1")
    .bind(userId)
    .first<{ count: number }>();

  return {
    lastRunAt: lastRun?.finishedAt ?? null,
    lastRunStatus: lastRun?.status ?? null,
    trackedItems: Number(countRow?.count ?? 0),
  };
}

export async function listUsersForCron(
  db: D1Database,
): Promise<Array<{ id: string; telegramChatId: string }>> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      "SELECT id, telegram_chat_id as telegramChatId FROM users WHERE is_active = 1 AND reauth_required = 0",
    )
    .all<{ id: string; telegramChatId: string }>();
  return rows.results ?? [];
}

export async function getUserByTelegramChatId(
  db: D1Database,
  chatId: string,
): Promise<{
  id: string;
  telegramChatId: string;
  name: string | null;
  reauthRequired: boolean;
} | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      "SELECT id, telegram_chat_id as telegramChatId, name, reauth_required as reauthRequired FROM users WHERE telegram_chat_id = ?1 LIMIT 1",
    )
    .bind(chatId)
    .first<{ id: string; telegramChatId: string; name: string | null; reauthRequired: number }>();
  if (!row) return null;
  return {
    id: row.id,
    telegramChatId: row.telegramChatId,
    name: row.name,
    reauthRequired: Boolean(row.reauthRequired),
  };
}

export async function getUserSettings(db: D1Database, userId: string): Promise<UserSettings> {
  await ensureSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_settings (user_id, paused, notify_new, notify_changed, timezone, updated_at) VALUES (?1, 0, 1, 1, 'UTC', ?2)",
    )
    .bind(userId, ts)
    .run();

  const row = await db
    .prepare(
      "SELECT paused, notify_new as notifyNew, notify_changed as notifyChanged, timezone FROM user_settings WHERE user_id = ?1 LIMIT 1",
    )
    .bind(userId)
    .first<{ paused: number; notifyNew: number; notifyChanged: number; timezone: string }>();

  return {
    paused: Boolean(row?.paused ?? 0),
    notifyNew: Boolean(row?.notifyNew ?? 1),
    notifyChanged: Boolean(row?.notifyChanged ?? 1),
    timezone: row?.timezone ?? "UTC",
  };
}

export async function setUserPaused(
  db: D1Database,
  userId: string,
  paused: boolean,
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      "INSERT INTO user_settings (user_id, paused, notify_new, notify_changed, timezone, updated_at) VALUES (?1, ?2, 1, 1, 'UTC', ?3) ON CONFLICT(user_id) DO UPDATE SET paused = excluded.paused, updated_at = excluded.updated_at",
    )
    .bind(userId, paused ? 1 : 0, ts)
    .run();
}

export async function setUserTimezone(
  db: D1Database,
  userId: string,
  timezone: string,
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  await db
    .prepare(
      "INSERT INTO user_settings (user_id, paused, notify_new, notify_changed, timezone, updated_at) VALUES (?1, 0, 1, 1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at",
    )
    .bind(userId, timezone, ts)
    .run();
}

export async function setUserNotifyMode(
  db: D1Database,
  userId: string,
  mode: NotifyMode,
): Promise<void> {
  await ensureSchema(db);
  const ts = nowIso();
  const notifyNew = mode === "all" || mode === "new" ? 1 : 0;
  const notifyChanged = mode === "all" || mode === "changed" ? 1 : 0;
  await db
    .prepare(
      "INSERT INTO user_settings (user_id, paused, notify_new, notify_changed, timezone, updated_at) VALUES (?1, 0, ?2, ?3, 'UTC', ?4) ON CONFLICT(user_id) DO UPDATE SET notify_new = excluded.notify_new, notify_changed = excluded.notify_changed, updated_at = excluded.updated_at",
    )
    .bind(userId, notifyNew, notifyChanged, ts)
    .run();
}
