import { TaggedError } from "better-result";

function messageFromCause(prefix: string, cause: unknown): string {
  if (cause instanceof Error) return `${prefix}: ${cause.message}`;
  return `${prefix}: ${String(cause)}`;
}

export class MissingBindingsError extends TaggedError("MissingBindingsError")<{
  bindings: string[];
  message: string;
}>() {
  constructor(args: { bindings: string[] }) {
    super({
      bindings: args.bindings,
      message: `Missing required bindings: ${args.bindings.join(", ")}`,
    });
  }
}

export class InvalidJsonBodyError extends TaggedError("InvalidJsonBodyError")<{
  route: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { route: string; cause: unknown }) {
    super({
      route: args.route,
      cause: args.cause,
      message: messageFromCause(`Invalid JSON body for ${args.route}`, args.cause),
    });
  }
}

export class DatabaseOperationError extends TaggedError("DatabaseOperationError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    super({
      operation: args.operation,
      cause: args.cause,
      message: messageFromCause(`Database operation failed (${args.operation})`, args.cause),
    });
  }
}

export class AuthProcessingError extends TaggedError("AuthProcessingError")<{
  message: string;
  cause: unknown;
}>() {
  constructor(args: { cause: unknown }) {
    super({
      cause: args.cause,
      message: messageFromCause("Auth processing failed", args.cause),
    });
  }
}

export class SessionEncodeError extends TaggedError("SessionEncodeError")<{
  message: string;
  cause: unknown;
}>() {
  constructor(args: { cause: unknown }) {
    super({
      cause: args.cause,
      message: messageFromCause("Session encoding failed", args.cause),
    });
  }
}

export class SessionStoreWriteError extends TaggedError("SessionStoreWriteError")<{
  userId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { userId: string; cause: unknown }) {
    super({
      userId: args.userId,
      cause: args.cause,
      message: messageFromCause(`Writing session KV failed for user ${args.userId}`, args.cause),
    });
  }
}

export class SessionStoreReadError extends TaggedError("SessionStoreReadError")<{
  userId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { userId: string; cause: unknown }) {
    super({
      userId: args.userId,
      cause: args.cause,
      message: messageFromCause(`Failed reading session for user ${args.userId}`, args.cause),
    });
  }
}

export class SessionNotFoundError extends TaggedError("SessionNotFoundError")<{
  userId: string;
  message: string;
}>() {
  constructor(args: { userId: string }) {
    super({
      userId: args.userId,
      message: `Session not found for user ${args.userId}`,
    });
  }
}

export class SessionDecodeError extends TaggedError("SessionDecodeError")<{
  userId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { userId: string; cause: unknown }) {
    super({
      userId: args.userId,
      cause: args.cause,
      message: messageFromCause(`Failed decoding session for user ${args.userId}`, args.cause),
    });
  }
}

export class InvalidSessionPayloadError extends TaggedError("InvalidSessionPayloadError")<{
  message: string;
  payloadPreview: string;
}>() {
  constructor(args: { payload: string }) {
    super({
      payloadPreview: args.payload.slice(0, 60),
      message: "Invalid session payload format",
    });
  }
}

export class CourseraRequestError extends TaggedError("CourseraRequestError")<{
  degreeId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { degreeId: string; cause: unknown }) {
    super({
      degreeId: args.degreeId,
      cause: args.cause,
      message: messageFromCause(`Coursera request failed for degree ${args.degreeId}`, args.cause),
    });
  }
}

export class CourseraAuthExpiredError extends TaggedError("CourseraAuthExpiredError")<{
  degreeId: string;
  status: number;
  message: string;
}>() {
  constructor(args: { degreeId: string; status: number }) {
    super({
      degreeId: args.degreeId,
      status: args.status,
      message: `Coursera auth expired for degree ${args.degreeId} (HTTP ${args.status})`,
    });
  }
}

export class CourseraFetchError extends TaggedError("CourseraFetchError")<{
  degreeId: string;
  status: number;
  message: string;
}>() {
  constructor(args: { degreeId: string; status: number }) {
    super({
      degreeId: args.degreeId,
      status: args.status,
      message: `Coursera fetch failed for degree ${args.degreeId} (HTTP ${args.status})`,
    });
  }
}

export class CourseraPayloadParseError extends TaggedError("CourseraPayloadParseError")<{
  degreeId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { degreeId: string; cause: unknown }) {
    super({
      degreeId: args.degreeId,
      cause: args.cause,
      message: messageFromCause(`Invalid Coursera payload for degree ${args.degreeId}`, args.cause),
    });
  }
}

export class TelegramSendError extends TaggedError("TelegramSendError")<{
  chatId: string;
  status: number;
  message: string;
}>() {
  constructor(args: { chatId: string; status: number }) {
    super({
      chatId: args.chatId,
      status: args.status,
      message: `Telegram send failed for chat ${args.chatId} (HTTP ${args.status})`,
    });
  }
}

export class TelegramRequestError extends TaggedError("TelegramRequestError")<{
  chatId: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { chatId: string; cause: unknown }) {
    super({
      chatId: args.chatId,
      cause: args.cause,
      message: messageFromCause(`Telegram request failed for chat ${args.chatId}`, args.cause),
    });
  }
}

export class FetchNowDatabaseError extends TaggedError("FetchNowDatabaseError")<{
  operation: string;
  message: string;
  cause: unknown;
}>() {
  constructor(args: { operation: string; cause: unknown }) {
    super({
      operation: args.operation,
      cause: args.cause,
      message: messageFromCause(`Database operation failed (${args.operation})`, args.cause),
    });
  }
}

export class FetchLockActiveError extends TaggedError("FetchLockActiveError")<{
  userId: string;
  message: string;
}>() {
  constructor(args: { userId: string }) {
    super({
      userId: args.userId,
      message: `Fetch already running for user ${args.userId}`,
    });
  }
}

export type FetchNowError =
  | MissingBindingsError
  | InvalidJsonBodyError
  | SessionStoreReadError
  | SessionNotFoundError
  | InvalidSessionPayloadError
  | SessionDecodeError
  | CourseraRequestError
  | CourseraAuthExpiredError
  | CourseraFetchError
  | CourseraPayloadParseError
  | TelegramSendError
  | TelegramRequestError
  | FetchNowDatabaseError
  | FetchLockActiveError;
