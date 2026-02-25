import { Result } from "better-result";
import { TelegramRequestError, TelegramSendError } from "../errors";
import type { FetchLike } from "../types";

export type InlineKeyboardMarkup = {
  inline_keyboard: Array<
    Array<
      | {
          text: string;
          callback_data: string;
        }
      | {
          text: string;
          url: string;
        }
    >
  >;
};

export type InlineQueryResultArticle = {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: {
    message_text: string;
    parse_mode?: "HTML" | "MarkdownV2";
    disable_web_page_preview?: boolean;
  };
};

export function formatDeadlineChangeMessage(input: {
  eventType: "new" | "changed" | "removed";
  courseName: string;
  title: string;
  oldDeadlineAt: string | null;
  newDeadlineAt: string | null;
  timezone?: string;
  itemUrl?: string;
}): string {
  const formattedOld = formatDeadlineAt(input.oldDeadlineAt, input.timezone);
  const formattedNew = formatDeadlineAt(input.newDeadlineAt, input.timezone);
  const heading =
    input.eventType === "new"
      ? "New deadline"
      : input.eventType === "removed"
        ? "Deadline removed"
        : "Deadline updated";

  const lines = [
    `<b>${escapeTelegramHtml(heading)}</b>`,
    `<b>Course:</b> ${escapeTelegramHtml(input.courseName)}`,
    `<b>Item:</b> ${escapeTelegramHtml(input.title)}`,
    `<b>Old:</b> <code>${escapeTelegramHtml(formattedOld)}</code>`,
    `<b>New:</b> <code>${escapeTelegramHtml(formattedNew)}</code>`,
  ];

  if (input.itemUrl) {
    lines.push(`<a href="${escapeTelegramHtml(input.itemUrl)}">Open in Coursera</a>`);
  }

  return lines.join("\n");
}

function formatDeadlineAt(value: string | null, timezone?: string): string {
  if (!value) return "-";
  if (!timezone) return value;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;

  const fmtResult = Result.try(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZoneName: "short",
      }),
  );
  if (Result.isError(fmtResult)) return value;
  return `${fmtResult.value.format(new Date(parsed))} (${timezone})`;
}

export async function sendTelegramMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
  replyMarkup?: InlineKeyboardMarkup;
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const payload: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: input.parseMode,
    disable_web_page_preview: true,
  };
  if (input.replyMarkup) payload.reply_markup = input.replyMarkup;
  return sendTelegramMethod({
    method: "sendMessage",
    botToken: input.botToken,
    chatIdForError: input.chatId,
    payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function editTelegramMessageText(input: {
  botToken: string;
  chatId: string;
  messageId: number;
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
  replyMarkup?: InlineKeyboardMarkup;
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const payload: Record<string, unknown> = {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    parse_mode: input.parseMode,
    disable_web_page_preview: true,
  };
  if (input.replyMarkup) payload.reply_markup = input.replyMarkup;
  return sendTelegramMethod({
    method: "editMessageText",
    botToken: input.botToken,
    chatIdForError: input.chatId,
    payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function answerTelegramCallbackQuery(input: {
  botToken: string;
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const payload: Record<string, unknown> = {
    callback_query_id: input.callbackQueryId,
    show_alert: Boolean(input.showAlert),
  };
  if (input.text) payload.text = input.text;
  return sendTelegramMethod({
    method: "answerCallbackQuery",
    botToken: input.botToken,
    chatIdForError: `callback:${input.callbackQueryId}`,
    payload,
    fetchImpl: input.fetchImpl,
  });
}

export async function answerTelegramInlineQuery(input: {
  botToken: string;
  inlineQueryId: string;
  results: InlineQueryResultArticle[];
  cacheTime?: number;
  isPersonal?: boolean;
  nextOffset?: string;
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const payload: Record<string, unknown> = {
    inline_query_id: input.inlineQueryId,
    results: input.results,
    cache_time: input.cacheTime ?? 0,
    is_personal: input.isPersonal ?? true,
  };
  if (input.nextOffset) payload.next_offset = input.nextOffset;
  return sendTelegramMethod({
    method: "answerInlineQuery",
    botToken: input.botToken,
    chatIdForError: `inline:${input.inlineQueryId}`,
    payload,
    fetchImpl: input.fetchImpl,
  });
}

async function sendTelegramMethod(input: {
  method: string;
  botToken: string;
  chatIdForError: string;
  payload: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((resource, init) => globalThis.fetch(resource, init));
  const url = `https://api.telegram.org/bot${input.botToken}/${input.method}`;
  const responseResult = await Result.tryPromise({
    try: () =>
      fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.payload),
      }),
    catch: (cause) => new TelegramRequestError({ chatId: input.chatIdForError, cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  if (!responseResult.value.ok) {
    return Result.err(
      new TelegramSendError({ chatId: input.chatIdForError, status: responseResult.value.status }),
    );
  }
  return Result.ok();
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
