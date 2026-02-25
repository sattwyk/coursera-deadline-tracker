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
