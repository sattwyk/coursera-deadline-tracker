import { Result } from "better-result";
import {
  type DeadlineFilter,
  type NotifyMode,
  createOrGetUserAndToken,
  expireOnboardingLinks,
  getLastFetchStatus,
  getPendingOnboardingByLinkCode,
  getUserByTelegramChatId,
  getUserSettings,
  listCurrentDeadlines,
  markOnboardingLinked,
  setUserNotifyMode,
  setUserPaused,
  setUserTimezone,
} from "../db/repositories";
import {
  type InlineKeyboardMarkup,
  answerTelegramCallbackQuery,
  answerTelegramInlineQuery,
  editTelegramMessageText,
  escapeTelegramHtml,
  sendTelegramMessage,
} from "../notify/telegram";
import { parseJsonBodyWithSchema, runDbOperation } from "../result-utils";
import {
  telegramUpdateSchema,
  type TelegramCallbackQuery,
  type TelegramInlineQuery,
  type TelegramUpdate,
} from "../schemas";
import {
  type BotLocale,
  buildHelpText,
  isValidTimezone,
  parseTelegramCommand,
  resolveLocale,
} from "../telegram/commands";
import type { Env } from "../types";
import { runFetchNowForUser } from "../usecases/fetch-now";

type CallbackAction =
  | { kind: "list"; filter: DeadlineFilter; page: number }
  | { kind: "status" }
  | { kind: "settings" }
  | { kind: "sync" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "mode"; mode: NotifyMode }
  | { kind: "unknown" };

type UiText = {
  statusTitle: string;
  settingsTitle: string;
  trackedItems: string;
  noDeadlines: string;
  listTitle: string;
  showing: string;
  page: string;
  statusPending: string;
  statusCompleted: string;
  notLinked: string;
  connectHint: string;
  connectedTitle: string;
  connectedHint: string;
  invalidOrExpired: string;
  usageMode: string;
  usageTimezone: string;
  invalidTimezone: string;
  paused: string;
  resumed: string;
  modeUpdated: string;
  timezoneUpdated: string;
  syncOk: string;
  syncFail: string;
  unknownCommand: string;
  testOk: string;
  buttons: {
    upcoming: string;
    pending: string;
    completed: string;
    overdue: string;
    all: string;
    prev: string;
    next: string;
    sync: string;
    pause: string;
    resume: string;
    status: string;
    modeChanged: string;
    modeAll: string;
  };
};

const PAGE_SIZE = 8;
const FILTERS: DeadlineFilter[] = ["pending", "completed", "upcoming", "overdue", "all"];
const DEFAULT_FILTER: DeadlineFilter = "upcoming";

const UI_BY_LOCALE: Record<BotLocale, UiText> = {
  en: {
    statusTitle: "Status",
    settingsTitle: "Current settings",
    trackedItems: "tracked_items",
    noDeadlines: "No deadlines found for this filter.",
    listTitle: "Deadlines",
    showing: "Showing",
    page: "Page",
    statusPending: "pending",
    statusCompleted: "completed",
    notLinked: "You are not linked yet.",
    connectHint: "Open the extension and tap <b>Connect Telegram</b> to generate a secure link.",
    connectedTitle: "Telegram connected",
    connectedHint:
      "Return to the extension. It will finish Coursera connection automatically.\n\nIf it does not finish, open your Coursera degree page once and refresh.",
    invalidOrExpired:
      "This setup link is invalid or expired. Open the extension and generate a new link.",
    usageMode: "Usage: <code>/mode &lt;all|new|changed|none&gt;</code>",
    usageTimezone:
      "Usage: <code>/tz &lt;IANA timezone&gt;</code> (example: <code>/tz Asia/Kolkata</code>)",
    invalidTimezone: "Invalid timezone",
    paused: "Notifications paused. Use <code>/resume</code> to enable again.",
    resumed: "Notifications resumed.",
    modeUpdated: "Notification mode updated to",
    timezoneUpdated: "Timezone updated to",
    syncOk: "Sync complete.",
    syncFail: "Sync failed",
    unknownCommand: "Unknown command",
    testOk: "Test OK at",
    buttons: {
      upcoming: "Upcoming",
      pending: "Pending",
      completed: "Completed",
      overdue: "Overdue",
      all: "All",
      prev: "Prev",
      next: "Next",
      sync: "Sync now",
      pause: "Pause",
      resume: "Resume",
      status: "Status",
      modeChanged: "Mode: changed",
      modeAll: "Mode: all",
    },
  },
  hi: {
    statusTitle: "Status",
    settingsTitle: "Current settings",
    trackedItems: "tracked_items",
    noDeadlines: "Is filter ke liye deadlines nahi mili.",
    listTitle: "Deadlines",
    showing: "Showing",
    page: "Page",
    statusPending: "pending",
    statusCompleted: "completed",
    notLinked: "Aap abhi linked nahi hain.",
    connectHint: "Extension kholiye aur <b>Connect Telegram</b> dabaiye.",
    connectedTitle: "Telegram connected",
    connectedHint:
      "Extension par wapas jaaiye. Coursera connection auto-complete hoga.\n\nAgar na ho to Coursera degree page ek baar refresh kariye.",
    invalidOrExpired: "Yeh setup link invalid ya expired hai. Extension se naya link banaiye.",
    usageMode: "Usage: <code>/mode &lt;all|new|changed|none&gt;</code>",
    usageTimezone:
      "Usage: <code>/tz &lt;IANA timezone&gt;</code> (example: <code>/tz Asia/Kolkata</code>)",
    invalidTimezone: "Invalid timezone",
    paused: "Notifications pause ho gayi hain. <code>/resume</code> use karein.",
    resumed: "Notifications resume ho gayi hain.",
    modeUpdated: "Notification mode update hua",
    timezoneUpdated: "Timezone update hua",
    syncOk: "Sync complete.",
    syncFail: "Sync failed",
    unknownCommand: "Unknown command",
    testOk: "Test OK at",
    buttons: {
      upcoming: "Upcoming",
      pending: "Pending",
      completed: "Completed",
      overdue: "Overdue",
      all: "All",
      prev: "Prev",
      next: "Next",
      sync: "Sync now",
      pause: "Pause",
      resume: "Resume",
      status: "Status",
      modeChanged: "Mode: changed",
      modeAll: "Mode: all",
    },
  },
  es: {
    statusTitle: "Estado",
    settingsTitle: "Ajustes actuales",
    trackedItems: "elementos_seguidos",
    noDeadlines: "No hay fechas límite para este filtro.",
    listTitle: "Fechas límite",
    showing: "Mostrando",
    page: "Página",
    statusPending: "pendiente",
    statusCompleted: "completado",
    notLinked: "Aún no estás vinculado.",
    connectHint: "Abre la extensión y pulsa <b>Connect Telegram</b> para generar un enlace seguro.",
    connectedTitle: "Telegram conectado",
    connectedHint:
      "Vuelve a la extensión. Finalizará la conexión con Coursera automáticamente.\n\nSi no termina, abre tu página de grado en Coursera y actualiza una vez.",
    invalidOrExpired:
      "Este enlace de configuración es inválido o expiró. Genera uno nuevo en la extensión.",
    usageMode: "Uso: <code>/mode &lt;all|new|changed|none&gt;</code>",
    usageTimezone:
      "Uso: <code>/tz &lt;IANA timezone&gt;</code> (ejemplo: <code>/tz Europe/Madrid</code>)",
    invalidTimezone: "Zona horaria inválida",
    paused: "Notificaciones en pausa. Usa <code>/resume</code> para reanudarlas.",
    resumed: "Notificaciones reanudadas.",
    modeUpdated: "Modo de notificación actualizado a",
    timezoneUpdated: "Zona horaria actualizada a",
    syncOk: "Sincronización completa.",
    syncFail: "Sincronización fallida",
    unknownCommand: "Comando desconocido",
    testOk: "Prueba OK en",
    buttons: {
      upcoming: "Próximas",
      pending: "Pendientes",
      completed: "Completadas",
      overdue: "Vencidas",
      all: "Todas",
      prev: "Prev",
      next: "Sig",
      sync: "Sincronizar",
      pause: "Pausar",
      resume: "Reanudar",
      status: "Estado",
      modeChanged: "Modo: changed",
      modeAll: "Modo: all",
    },
  },
};

function ui(locale: BotLocale): UiText {
  return UI_BY_LOCALE[locale];
}

function normalizeFilter(raw?: string | null): DeadlineFilter {
  const value = (raw ?? "").toLowerCase();
  if (value === "everything") return "all";
  return FILTERS.includes(value as DeadlineFilter) ? (value as DeadlineFilter) : DEFAULT_FILTER;
}

function getUpdateMessage(
  update: TelegramUpdate,
): { text: string; chatId: string; locale: BotLocale } | null {
  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  if (chatId === undefined || chatId === null) return null;
  const text = typeof msg?.text === "string" ? msg.text.trim() : "";
  const locale = resolveLocale(msg?.from?.language_code ?? null);
  return {
    text,
    chatId: String(chatId),
    locale,
  };
}

function formatDeadlineAt(value: string, timezone: string): string {
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
  return fmtResult.value.format(new Date(parsed));
}

function buildSettingsSummary(input: {
  paused: boolean;
  notifyNew: boolean;
  notifyChanged: boolean;
  timezone: string;
  locale: BotLocale;
}): string {
  const mode =
    input.notifyNew && input.notifyChanged
      ? "all"
      : input.notifyNew
        ? "new"
        : input.notifyChanged
          ? "changed"
          : "none";
  const strings = ui(input.locale);
  return [
    `<b>${strings.settingsTitle}</b>`,
    `paused: <code>${input.paused ? "yes" : "no"}</code>`,
    `mode: <code>${mode}</code>`,
    `timezone: <code>${escapeTelegramHtml(input.timezone)}</code>`,
  ].join("\n");
}

function buildStatusKeyboard(locale: BotLocale, paused: boolean): InlineKeyboardMarkup {
  const strings = ui(locale);
  return {
    inline_keyboard: [
      [
        { text: strings.buttons.upcoming, callback_data: "list:upcoming:0" },
        { text: strings.buttons.pending, callback_data: "list:pending:0" },
        { text: strings.buttons.completed, callback_data: "list:completed:0" },
      ],
      [
        { text: strings.buttons.overdue, callback_data: "list:overdue:0" },
        { text: strings.buttons.all, callback_data: "list:all:0" },
      ],
      [
        { text: strings.buttons.sync, callback_data: "act:sync" },
        {
          text: paused ? strings.buttons.resume : strings.buttons.pause,
          callback_data: paused ? "act:resume" : "act:pause",
        },
      ],
      [
        { text: strings.buttons.modeChanged, callback_data: "act:mode:changed" },
        { text: strings.buttons.modeAll, callback_data: "act:mode:all" },
      ],
    ],
  };
}

function buildListKeyboard(input: {
  locale: BotLocale;
  paused: boolean;
  filter: DeadlineFilter;
  page: number;
  hasPrev: boolean;
  hasNext: boolean;
}): InlineKeyboardMarkup {
  const strings = ui(input.locale);
  const pageRow: InlineKeyboardMarkup["inline_keyboard"][number] = [];
  if (input.hasPrev) {
    pageRow.push({
      text: strings.buttons.prev,
      callback_data: `list:${input.filter}:${Math.max(0, input.page - 1)}`,
    });
  }
  if (input.hasNext) {
    pageRow.push({
      text: strings.buttons.next,
      callback_data: `list:${input.filter}:${input.page + 1}`,
    });
  }

  const keyboard = buildStatusKeyboard(input.locale, input.paused).inline_keyboard;
  if (pageRow.length > 0) {
    keyboard.splice(2, 0, pageRow);
  }
  keyboard.push([{ text: strings.buttons.status, callback_data: "act:status" }]);
  return { inline_keyboard: keyboard };
}

function parseCallbackData(raw: string | undefined): CallbackAction {
  if (!raw) return { kind: "unknown" };

  const listMatch = raw.match(/^list:(pending|completed|upcoming|overdue|all):(\d+)$/);
  if (listMatch) {
    return {
      kind: "list",
      filter: listMatch[1] as DeadlineFilter,
      page: Number(listMatch[2]),
    };
  }

  if (raw === "act:status") return { kind: "status" };
  if (raw === "act:settings") return { kind: "settings" };
  if (raw === "act:sync") return { kind: "sync" };
  if (raw === "act:pause") return { kind: "pause" };
  if (raw === "act:resume") return { kind: "resume" };

  const modeMatch = raw.match(/^act:mode:(all|new|changed|none)$/);
  if (modeMatch) return { kind: "mode", mode: modeMatch[1] as NotifyMode };

  return { kind: "unknown" };
}

function toAbsoluteCourseraUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `https://www.coursera.org${url}`;
  return `https://www.coursera.org/${url}`;
}

async function replyHtml(input: {
  env: Env;
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
}): Promise<Result<void, Error>> {
  if (!input.env.TELEGRAM_BOT_TOKEN) {
    return Result.err(new Error("TELEGRAM_BOT_TOKEN missing"));
  }
  const sendResult = await sendTelegramMessage({
    botToken: input.env.TELEGRAM_BOT_TOKEN,
    chatId: input.chatId,
    text: input.text,
    parseMode: "HTML",
    replyMarkup: input.replyMarkup,
  });
  if (Result.isError(sendResult)) {
    return Result.err(new Error(sendResult.error.message));
  }
  return Result.ok();
}

async function editOrReplyFromCallback(input: {
  env: Env;
  callback: TelegramCallbackQuery;
  text: string;
  replyMarkup?: InlineKeyboardMarkup;
}): Promise<Result<void, Error>> {
  const botToken = input.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return Result.err(new Error("TELEGRAM_BOT_TOKEN missing"));

  const callbackChatId = String(input.callback.from.id);
  const chatId = input.callback.message?.chat?.id;
  const messageId = input.callback.message?.message_id;
  if (chatId !== undefined && chatId !== null && typeof messageId === "number") {
    const editResult = await editTelegramMessageText({
      botToken,
      chatId: String(chatId),
      messageId,
      text: input.text,
      parseMode: "HTML",
      replyMarkup: input.replyMarkup,
    });
    if (Result.isOk(editResult)) return Result.ok();
  }

  return replyHtml({
    env: input.env,
    chatId: callbackChatId,
    text: input.text,
    replyMarkup: input.replyMarkup,
  });
}

async function ackCallback(input: {
  env: Env;
  callbackQueryId: string;
  text?: string;
}): Promise<void> {
  if (!input.env.TELEGRAM_BOT_TOKEN) return;
  await answerTelegramCallbackQuery({
    botToken: input.env.TELEGRAM_BOT_TOKEN,
    callbackQueryId: input.callbackQueryId,
    text: input.text,
  });
}

async function handleStartLinkCommand(input: {
  env: Env;
  chatId: string;
  linkCode: string;
  locale: BotLocale;
}): Promise<Result<{ handled: string }, Error>> {
  const db = input.env.DB;
  const strings = ui(input.locale);
  if (!db) return Result.err(new Error("DB binding missing"));

  const expireResult = await runDbOperation("expireOnboardingLinks", () =>
    expireOnboardingLinks(db),
  );
  if (Result.isError(expireResult)) return Result.err(new Error(expireResult.error.message));

  const onboardingResult = await runDbOperation("getPendingOnboardingByLinkCode", () =>
    getPendingOnboardingByLinkCode(db, input.linkCode),
  );
  if (Result.isError(onboardingResult))
    return Result.err(new Error(onboardingResult.error.message));

  const onboarding = onboardingResult.value;
  if (!onboarding) {
    const reply = await replyHtml({
      env: input.env,
      chatId: input.chatId,
      text: strings.invalidOrExpired,
    });
    if (Result.isError(reply)) return Result.err(reply.error);
    return Result.ok({ handled: "invalid-onboarding-link" });
  }

  const createResult = await runDbOperation("createOrGetUserAndToken", () =>
    createOrGetUserAndToken(db, {
      name: onboarding.name?.trim() || "Coursera User",
      telegramChatId: input.chatId,
    }),
  );
  if (Result.isError(createResult)) return Result.err(new Error(createResult.error.message));

  const markResult = await runDbOperation("markOnboardingLinked", () =>
    markOnboardingLinked(db, {
      onboardingId: onboarding.id,
      userId: createResult.value.userId,
      telegramChatId: input.chatId,
      apiToken: createResult.value.token,
    }),
  );
  if (Result.isError(markResult)) return Result.err(new Error(markResult.error.message));

  const reply = await replyHtml({
    env: input.env,
    chatId: input.chatId,
    text: [`<b>${strings.connectedTitle}</b>`, strings.connectedHint].join("\n"),
  });
  if (Result.isError(reply)) return Result.err(reply.error);

  return Result.ok({ handled: "onboarding-linked" });
}

async function buildStatusCard(input: {
  env: Env;
  userId: string;
  reauthRequired: boolean;
  locale: BotLocale;
}): Promise<Result<{ text: string; replyMarkup: InlineKeyboardMarkup }, Error>> {
  const db = input.env.DB;
  if (!db) return Result.err(new Error("DB binding missing"));
  const strings = ui(input.locale);

  const statusResult = await runDbOperation("getLastFetchStatus", () =>
    getLastFetchStatus(db, input.userId),
  );
  if (Result.isError(statusResult)) return Result.err(new Error(statusResult.error.message));

  const settingsResult = await runDbOperation("getUserSettings", () =>
    getUserSettings(db, input.userId),
  );
  if (Result.isError(settingsResult)) return Result.err(new Error(settingsResult.error.message));

  const status = statusResult.value;
  const settings = settingsResult.value;
  const text = [
    `<b>${strings.statusTitle}</b>`,
    `last_run_status: <code>${escapeTelegramHtml(status.lastRunStatus ?? "none")}</code>`,
    `last_run_at: <code>${escapeTelegramHtml(status.lastRunAt ?? "none")}</code>`,
    `${strings.trackedItems}: <code>${status.trackedItems}</code>`,
    `reauth_required: <code>${input.reauthRequired ? "yes" : "no"}</code>`,
    "",
    buildSettingsSummary({
      paused: settings.paused,
      notifyNew: settings.notifyNew,
      notifyChanged: settings.notifyChanged,
      timezone: settings.timezone,
      locale: input.locale,
    }),
  ].join("\n");

  return Result.ok({
    text,
    replyMarkup: buildStatusKeyboard(input.locale, settings.paused),
  });
}

async function buildListCard(input: {
  env: Env;
  userId: string;
  locale: BotLocale;
  filter: DeadlineFilter;
  page: number;
}): Promise<Result<{ text: string; replyMarkup: InlineKeyboardMarkup }, Error>> {
  const db = input.env.DB;
  if (!db) return Result.err(new Error("DB binding missing"));
  const strings = ui(input.locale);

  const settingsResult = await runDbOperation("getUserSettings", () =>
    getUserSettings(db, input.userId),
  );
  if (Result.isError(settingsResult)) return Result.err(new Error(settingsResult.error.message));

  const settings = settingsResult.value;
  const page = Math.max(0, input.page);
  const offset = page * PAGE_SIZE;
  const listResult = await runDbOperation("listCurrentDeadlines", () =>
    listCurrentDeadlines(db, {
      userId: input.userId,
      filter: input.filter,
      limit: PAGE_SIZE + 1,
      offset,
    }),
  );
  if (Result.isError(listResult)) return Result.err(new Error(listResult.error.message));

  const hasNext = listResult.value.length > PAGE_SIZE;
  const items = hasNext ? listResult.value.slice(0, PAGE_SIZE) : listResult.value;
  const hasPrev = page > 0;

  const body =
    items.length === 0
      ? strings.noDeadlines
      : items
          .map((item, idx) => {
            const itemStatus = item.isComplete ? strings.statusCompleted : strings.statusPending;
            const due = formatDeadlineAt(item.deadlineAt, settings.timezone);
            return [
              `<b>${offset + idx + 1}.</b> <b>${escapeTelegramHtml(item.courseName)}</b>`,
              `${escapeTelegramHtml(item.title)}`,
              `<code>${escapeTelegramHtml(due)}</code> · <code>${escapeTelegramHtml(itemStatus)}</code>`,
            ].join("\n");
          })
          .join("\n\n");

  const text = [
    `<b>${strings.listTitle}: ${escapeTelegramHtml(input.filter)}</b>`,
    `<i>${strings.showing} ${items.length} · ${strings.page} ${page + 1}</i>`,
    "",
    body,
  ].join("\n");

  return Result.ok({
    text,
    replyMarkup: buildListKeyboard({
      locale: input.locale,
      paused: settings.paused,
      filter: input.filter,
      page,
      hasPrev,
      hasNext,
    }),
  });
}

function parseInlineQuery(input: string): { filter: DeadlineFilter; term: string } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { filter: DEFAULT_FILTER, term: "" };
  const first = normalizeFilter(parts[0]);
  const isFilterExplicit = FILTERS.includes(parts[0]?.toLowerCase() as DeadlineFilter);
  if (isFilterExplicit || parts[0]?.toLowerCase() === "everything") {
    return {
      filter: first,
      term: parts.slice(1).join(" ").trim().toLowerCase(),
    };
  }
  return {
    filter: DEFAULT_FILTER,
    term: parts.join(" ").trim().toLowerCase(),
  };
}

async function handleInlineQuery(input: {
  env: Env;
  inlineQuery: TelegramInlineQuery;
}): Promise<Response> {
  const botToken = input.env.TELEGRAM_BOT_TOKEN;
  const db = input.env.DB;
  if (!botToken || !db) {
    return Response.json({ ok: true, ignored: "missing-bindings" });
  }

  const locale = resolveLocale(input.inlineQuery.from.language_code ?? null);
  const strings = ui(locale);
  const query = parseInlineQuery(input.inlineQuery.query ?? "");
  const chatId = String(input.inlineQuery.from.id);

  const userResult = await runDbOperation("getUserByTelegramChatId", () =>
    getUserByTelegramChatId(db, chatId),
  );
  if (Result.isError(userResult)) {
    return Response.json(
      { ok: false, error: userResult.error.message, error_type: userResult.error._tag },
      { status: 500 },
    );
  }

  const inlineUser = userResult.value;
  if (!inlineUser) {
    const out = await answerTelegramInlineQuery({
      botToken,
      inlineQueryId: input.inlineQuery.id,
      results: [
        {
          type: "article",
          id: "unlinked-1",
          title: strings.notLinked,
          description: "Open the extension to connect Telegram first.",
          input_message_content: {
            message_text: `${strings.notLinked}\n${strings.connectHint.replace(/<[^>]+>/g, "")}`,
            disable_web_page_preview: true,
          },
        },
      ],
    });
    if (Result.isError(out)) {
      return Response.json({ ok: false, error: out.error.message }, { status: 502 });
    }
    return Response.json({ ok: true, handled: "inline-unlinked" });
  }

  const settingsResult = await runDbOperation("getUserSettings", () =>
    getUserSettings(db, inlineUser.id),
  );
  if (Result.isError(settingsResult)) {
    return Response.json(
      { ok: false, error: settingsResult.error.message, error_type: settingsResult.error._tag },
      { status: 500 },
    );
  }

  const listResult = await runDbOperation("listCurrentDeadlines", () =>
    listCurrentDeadlines(db, {
      userId: inlineUser.id,
      filter: query.filter,
      limit: 50,
      offset: 0,
    }),
  );
  if (Result.isError(listResult)) {
    return Response.json(
      { ok: false, error: listResult.error.message, error_type: listResult.error._tag },
      { status: 500 },
    );
  }

  const term = query.term;
  const filtered =
    term.length === 0
      ? listResult.value
      : listResult.value.filter((item) => {
          const haystack = `${item.courseName} ${item.title}`.toLowerCase();
          return haystack.includes(term);
        });

  const results = filtered.slice(0, 20).map((item, idx) => {
    const due = formatDeadlineAt(item.deadlineAt, settingsResult.value.timezone);
    const status = item.isComplete ? strings.statusCompleted : strings.statusPending;
    return {
      type: "article" as const,
      id: `${idx}-${item.stableKey}`.slice(0, 60),
      title: `${item.courseName} · ${item.title}`.slice(0, 256),
      description: `${due} · ${status}`.slice(0, 256),
      input_message_content: {
        message_text: [
          `<b>${escapeTelegramHtml(item.courseName)}</b>`,
          `${escapeTelegramHtml(item.title)}`,
          `<code>${escapeTelegramHtml(due)}</code> · <code>${escapeTelegramHtml(status)}</code>`,
          `<a href="${escapeTelegramHtml(toAbsoluteCourseraUrl(item.url))}">Open in Coursera</a>`,
        ].join("\n"),
        parse_mode: "HTML" as const,
        disable_web_page_preview: true,
      },
    };
  });

  const finalResults =
    results.length > 0
      ? results
      : [
          {
            type: "article" as const,
            id: "empty-1",
            title: strings.noDeadlines,
            description: `${strings.listTitle}: ${query.filter}`,
            input_message_content: {
              message_text: strings.noDeadlines,
              disable_web_page_preview: true,
            },
          },
        ];

  const out = await answerTelegramInlineQuery({
    botToken,
    inlineQueryId: input.inlineQuery.id,
    results: finalResults,
  });
  if (Result.isError(out)) {
    return Response.json({ ok: false, error: out.error.message }, { status: 502 });
  }
  return Response.json({ ok: true, handled: "inline-query" });
}

async function runCommand(input: {
  env: Env;
  chatId: string;
  locale: BotLocale;
  user: {
    id: string;
    telegramChatId: string;
    reauthRequired: boolean;
  };
  command: ReturnType<typeof parseTelegramCommand>;
}): Promise<Result<{ text: string; replyMarkup?: InlineKeyboardMarkup }, Error>> {
  const command = input.command;
  const strings = ui(input.locale);
  if (!command) {
    return Result.err(new Error("missing command"));
  }

  if (command.kind === "start" || command.kind === "help") {
    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) return statusCard;
    return Result.ok({
      text: `${buildHelpText(input.locale)}\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "status" || command.kind === "settings") {
    return buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
  }

  if (command.kind === "list") {
    return buildListCard({
      env: input.env,
      userId: input.user.id,
      locale: input.locale,
      filter: command.filter,
      page: 0,
    });
  }

  if (command.kind === "pause") {
    const db = input.env.DB;
    if (!db) return Result.err(new Error("DB binding missing"));
    const out = await runDbOperation("setUserPaused(true)", () =>
      setUserPaused(db, input.user.id, true),
    );
    if (Result.isError(out)) return Result.err(new Error(out.error.message));

    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) return statusCard;
    return Result.ok({
      text: `${strings.paused}\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "resume") {
    const db = input.env.DB;
    if (!db) return Result.err(new Error("DB binding missing"));
    const out = await runDbOperation("setUserPaused(false)", () =>
      setUserPaused(db, input.user.id, false),
    );
    if (Result.isError(out)) return Result.err(new Error(out.error.message));

    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) return statusCard;
    return Result.ok({
      text: `${strings.resumed}\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "mode") {
    if (!command.mode) {
      return Result.ok({ text: strings.usageMode });
    }
    const mode = command.mode;
    const db = input.env.DB;
    if (!db) return Result.err(new Error("DB binding missing"));
    const out = await runDbOperation("setUserNotifyMode", () =>
      setUserNotifyMode(db, input.user.id, mode),
    );
    if (Result.isError(out)) return Result.err(new Error(out.error.message));
    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) return statusCard;
    return Result.ok({
      text: `${strings.modeUpdated}: <code>${escapeTelegramHtml(mode)}</code>\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "timezone") {
    if (!command.timezone) {
      return Result.ok({ text: strings.usageTimezone });
    }
    if (!isValidTimezone(command.timezone)) {
      return Result.ok({
        text: `${strings.invalidTimezone}: <code>${escapeTelegramHtml(command.timezone)}</code>`,
      });
    }
    const db = input.env.DB;
    if (!db) return Result.err(new Error("DB binding missing"));
    const out = await runDbOperation("setUserTimezone", () =>
      setUserTimezone(db, input.user.id, command.timezone!),
    );
    if (Result.isError(out)) return Result.err(new Error(out.error.message));
    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) return statusCard;
    return Result.ok({
      text: `${strings.timezoneUpdated}: <code>${escapeTelegramHtml(command.timezone)}</code>\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "sync") {
    const out = await runFetchNowForUser({
      env: input.env,
      userId: input.user.id,
      telegramChatId: input.user.telegramChatId,
      nowIso: new Date().toISOString(),
    });
    const summary = out.ok
      ? `${strings.syncOk}\nitems_seen: <code>${out.itemsSeen}</code>\nevents_created: <code>${out.eventsCreated}</code>`
      : `${strings.syncFail}: <code>${escapeTelegramHtml(out.error ?? "unknown error")}</code>`;

    const statusCard = await buildStatusCard({
      env: input.env,
      userId: input.user.id,
      reauthRequired: input.user.reauthRequired,
      locale: input.locale,
    });
    if (Result.isError(statusCard)) {
      return Result.ok({ text: summary });
    }
    return Result.ok({
      text: `${summary}\n\n${statusCard.value.text}`,
      replyMarkup: statusCard.value.replyMarkup,
    });
  }

  if (command.kind === "test") {
    return Result.ok({ text: `${strings.testOk} <code>${new Date().toISOString()}</code>` });
  }

  return Result.ok({
    text: `${strings.unknownCommand}: <code>/${escapeTelegramHtml(command.raw)}</code>\n\n${buildHelpText(input.locale)}`,
  });
}

async function handleCallbackQuery(input: {
  env: Env;
  callback: TelegramCallbackQuery;
}): Promise<Response> {
  const db = input.env.DB;
  if (!db) return Response.json({ ok: true, ignored: "missing-db" });
  const locale = resolveLocale(input.callback.from.language_code ?? null);
  const strings = ui(locale);

  const userResult = await runDbOperation("getUserByTelegramChatId", () =>
    getUserByTelegramChatId(db, String(input.callback.from.id)),
  );
  if (Result.isError(userResult)) {
    await ackCallback({ env: input.env, callbackQueryId: input.callback.id, text: "Error" });
    return Response.json(
      { ok: false, error: userResult.error.message, error_type: userResult.error._tag },
      { status: 500 },
    );
  }

  const user = userResult.value;
  if (!user) {
    await ackCallback({
      env: input.env,
      callbackQueryId: input.callback.id,
      text: strings.notLinked,
    });
    const replyResult = await editOrReplyFromCallback({
      env: input.env,
      callback: input.callback,
      text: `${strings.notLinked}\n${strings.connectHint}`,
    });
    if (Result.isError(replyResult)) {
      return Response.json({ ok: false, error: replyResult.error.message }, { status: 502 });
    }
    return Response.json({ ok: true, handled: "callback-unlinked" });
  }

  const action = parseCallbackData(input.callback.data);
  let render: Result<{ text: string; replyMarkup?: InlineKeyboardMarkup }, Error>;

  if (action.kind === "list") {
    render = await buildListCard({
      env: input.env,
      userId: user.id,
      locale,
      filter: action.filter,
      page: action.page,
    });
  } else if (action.kind === "status" || action.kind === "settings") {
    render = await runCommand({
      env: input.env,
      chatId: String(input.callback.from.id),
      locale,
      user,
      command: action.kind === "status" ? { kind: "status" } : { kind: "settings" },
    });
  } else if (action.kind === "sync") {
    render = await runCommand({
      env: input.env,
      chatId: String(input.callback.from.id),
      locale,
      user,
      command: { kind: "sync" },
    });
  } else if (action.kind === "pause") {
    render = await runCommand({
      env: input.env,
      chatId: String(input.callback.from.id),
      locale,
      user,
      command: { kind: "pause" },
    });
  } else if (action.kind === "resume") {
    render = await runCommand({
      env: input.env,
      chatId: String(input.callback.from.id),
      locale,
      user,
      command: { kind: "resume" },
    });
  } else if (action.kind === "mode") {
    render = await runCommand({
      env: input.env,
      chatId: String(input.callback.from.id),
      locale,
      user,
      command: { kind: "mode", mode: action.mode },
    });
  } else {
    await ackCallback({
      env: input.env,
      callbackQueryId: input.callback.id,
      text: "Unknown action",
    });
    return Response.json({ ok: true, handled: "callback-unknown" });
  }

  if (Result.isError(render)) {
    await ackCallback({ env: input.env, callbackQueryId: input.callback.id, text: "Error" });
    return Response.json({ ok: false, error: render.error.message }, { status: 500 });
  }

  const out = await editOrReplyFromCallback({
    env: input.env,
    callback: input.callback,
    text: render.value.text,
    replyMarkup: render.value.replyMarkup,
  });
  if (Result.isError(out)) {
    await ackCallback({ env: input.env, callbackQueryId: input.callback.id, text: "Error" });
    return Response.json({ ok: false, error: out.error.message }, { status: 502 });
  }

  await ackCallback({ env: input.env, callbackQueryId: input.callback.id, text: "Updated" });
  return Response.json({ ok: true, handled: "callback" });
}

export async function handleTelegramWebhook(req: Request, env?: Env): Promise<Response> {
  const webhookSecret = env?.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== webhookSecret) {
      return Response.json({ ok: false, error: "invalid webhook secret" }, { status: 401 });
    }
  }

  if (!env?.DB || !env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ ok: true, warning: "missing DB or TELEGRAM_BOT_TOKEN binding" });
  }

  const updateResult = await parseJsonBodyWithSchema(
    req,
    "/api/telegram/webhook",
    telegramUpdateSchema,
  );
  if (Result.isError(updateResult)) {
    return Response.json(
      { ok: false, error: updateResult.error.message, error_type: updateResult.error._tag },
      { status: 400 },
    );
  }

  const update = updateResult.value;

  if (update.inline_query) {
    return handleInlineQuery({ env, inlineQuery: update.inline_query });
  }

  if (update.callback_query) {
    return handleCallbackQuery({ env, callback: update.callback_query });
  }

  const incoming = getUpdateMessage(update);
  if (!incoming) return Response.json({ ok: true, ignored: "no-message" });

  const command = parseTelegramCommand(incoming.text);
  if (!command) return Response.json({ ok: true, ignored: "no-command" });

  if (command.kind === "start" && command.payload) {
    const startResult = await handleStartLinkCommand({
      env,
      chatId: incoming.chatId,
      linkCode: command.payload,
      locale: incoming.locale,
    });
    if (Result.isError(startResult)) {
      return Response.json({ ok: false, error: startResult.error.message }, { status: 500 });
    }
    return Response.json({ ok: true, handled: startResult.value.handled });
  }

  const userResult = await runDbOperation("getUserByTelegramChatId", () =>
    getUserByTelegramChatId(env.DB!, incoming.chatId),
  );
  if (Result.isError(userResult)) {
    return Response.json(
      { ok: false, error: userResult.error.message, error_type: userResult.error._tag },
      { status: 500 },
    );
  }

  const user = userResult.value;
  if (!user) {
    const strings = ui(incoming.locale);
    const unregisteredResult = await replyHtml({
      env,
      chatId: incoming.chatId,
      text: [strings.notLinked, strings.connectHint].join("\n"),
    });
    if (Result.isError(unregisteredResult)) {
      return Response.json({ ok: false, error: unregisteredResult.error.message }, { status: 502 });
    }
    return Response.json({ ok: true, handled: "unregistered" });
  }

  const reply = await runCommand({
    env,
    chatId: incoming.chatId,
    locale: incoming.locale,
    user,
    command,
  });
  if (Result.isError(reply)) {
    return Response.json({ ok: false, error: reply.error.message }, { status: 500 });
  }

  const replyResult = await replyHtml({
    env,
    chatId: incoming.chatId,
    text: reply.value.text,
    replyMarkup: reply.value.replyMarkup,
  });
  if (Result.isError(replyResult)) {
    return Response.json({ ok: false, error: replyResult.error.message }, { status: 502 });
  }

  return Response.json({ ok: true });
}
