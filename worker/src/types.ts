export type Env = {
  DB?: D1Database;
  SESSIONS?: KVNamespace;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_BOT_USERNAME?: string;
  SESSION_SECRET?: string;
};

export type AuthUser = {
  id: string;
  telegramChatId: string;
  name: string | null;
};

export type UserSettings = {
  paused: boolean;
  notifyNew: boolean;
  notifyChanged: boolean;
  timezone: string;
};

export type SessionBundle = {
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
  }>;
  csrf3Token: string;
  courseraUserId: number;
  degreeIds: string[];
  capturedAt: string;
};

export type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;
