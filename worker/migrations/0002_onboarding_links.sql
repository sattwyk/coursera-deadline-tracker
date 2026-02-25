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
