import { Result } from "better-result";
import { TelegramRequestError, TelegramSendError } from "../errors";
import type { FetchLike } from "../types";

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
  fetchImpl?: FetchLike;
}): Promise<Result<void, TelegramSendError | TelegramRequestError>> {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? ((resource, init) => globalThis.fetch(resource, init));
  const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
  const responseResult = await Result.tryPromise({
    try: () =>
      fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode,
          disable_web_page_preview: true,
        }),
      }),
    catch: (cause) => new TelegramRequestError({ chatId: input.chatId, cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  if (!responseResult.value.ok) {
    return Result.err(
      new TelegramSendError({ chatId: input.chatId, status: responseResult.value.status }),
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
