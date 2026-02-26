import { Result } from "better-result";
import type * as z from "zod/mini";
import { ExtensionHttpError, ExtensionInvalidResponseError, ExtensionRuntimeError } from "./errors";
import {
  autoDetectionSchema,
  backgroundEnvelopeSchema,
  fetchNowResponseSchema,
  onboardingPollValueSchema,
  onboardingStartValueSchema,
  registerResponseSchema,
  sessionAutoConnectResponseSchema,
  stateSchema,
  statusResponseSchema,
} from "./schemas";
import type { AutoDetection, RegisterResponse, PopupState, State } from "./types";

type ApiRequest = {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  token?: string;
  body?: unknown;
};

type PopupApiError = ExtensionRuntimeError | ExtensionHttpError | ExtensionInvalidResponseError;
type PopupMessageError = ExtensionRuntimeError;
type PopupOnboardingError = PopupMessageError | ExtensionInvalidResponseError;

const DEFAULT_BASE_URL =
  typeof import.meta.env.WXT_WORKER_BASE_URL === "string" &&
  import.meta.env.WXT_WORKER_BASE_URL.trim()
    ? import.meta.env.WXT_WORKER_BASE_URL.trim()
    : "http://127.0.0.1:8787";

const DEV_KNOBS_ENABLED =
  (typeof import.meta.env.WXT_DEV_KNOBS === "string"
    ? import.meta.env.WXT_DEV_KNOBS === "true"
    : import.meta.env.DEV) ?? false;

const KEYS = [
  "baseUrl",
  "apiToken",
  "userId",
  "name",
  "telegramChatId",
  "courseraUserId",
  "degreeIds",
  "autoCourseraUserId",
  "autoDegreeIds",
  "autoDetectedAt",
  "lastStatus",
  "lastStatusAt",
  "hasSession",
  "reauthRequired",
  "onboardingPollToken",
  "onboardingLinkUrl",
  "onboardingExpiresAt",
] as const;

export function deriveStatusLabel(input: PopupState): string {
  if (input.reauthRequired) return "Reconnect needed";
  if (input.hasToken && input.hasSession) return "Connected";
  return "Not connected";
}

export function isDevKnobsEnabled(): boolean {
  return DEV_KNOBS_ENABLED;
}

export function getDefaultBaseUrl(): string {
  return DEFAULT_BASE_URL;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item) ?? "").filter(Boolean) : [];
}

function parseDegreeIds(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function getState(): Promise<State> {
  const raw = await chrome.storage.local.get(KEYS as unknown as (keyof State)[]);
  const parsed = stateSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export async function setState(patch: Partial<State>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export function getConfiguredBaseUrl(state?: State, manualBaseUrl?: string): string {
  if (DEV_KNOBS_ENABLED && manualBaseUrl?.trim()) {
    return manualBaseUrl.trim();
  }
  const fromState = state?.baseUrl?.trim();
  return fromState || DEFAULT_BASE_URL;
}

export function getManualOverrides(
  manualUserId: string,
  manualDegreeIds: string,
): {
  courseraUserId?: number;
  degreeIds?: string[];
} {
  if (!DEV_KNOBS_ENABLED) return {};

  const parsedUserId = manualUserId.trim() ? Number(manualUserId.trim()) : Number.NaN;
  const courseraUserId =
    Number.isFinite(parsedUserId) && parsedUserId > 0 ? parsedUserId : undefined;
  const degreeIds = parseDegreeIds(manualDegreeIds.trim());

  return {
    courseraUserId,
    degreeIds: degreeIds.length > 0 ? degreeIds : undefined,
  };
}

async function callApi<T extends Record<string, unknown> = Record<string, unknown>>(
  input: ApiRequest,
  schema?: z.ZodMiniType<T>,
): Promise<Result<T, PopupApiError>> {
  const operation = `API ${input.method} ${input.path}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.token) headers.authorization = `Bearer ${input.token}`;

  const responseResult = await Result.tryPromise({
    try: () =>
      fetch(`${input.baseUrl}${input.path}`, {
        method: input.method,
        headers,
        body: input.body ? JSON.stringify(input.body) : undefined,
      }),
    catch: (cause) => new ExtensionRuntimeError({ operation: `${operation} (request)`, cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  const textResult = await Result.tryPromise({
    try: () => responseResult.value.text(),
    catch: (cause) => new ExtensionRuntimeError({ operation: `${operation} (read-body)`, cause }),
  });
  if (Result.isError(textResult)) return textResult;

  const text = textResult.value;
  const json: Record<string, unknown> = (() => {
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  })();

  if (!responseResult.value.ok) {
    const reason = asString(json.error) ?? asString(json.raw) ?? undefined;
    return Result.err(
      new ExtensionHttpError({
        operation,
        status: responseResult.value.status,
        body: json,
        reason,
      }),
    );
  }

  if (!schema) return Result.ok(json as T);

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation,
        message: `Invalid response shape for ${operation}`,
      }),
    );
  }
  return Result.ok(parsed.data);
}

function sendMessage<T = unknown>(
  msg: Record<string, unknown>,
): Promise<Result<T, PopupMessageError>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res: unknown) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve(
          Result.err(
            new ExtensionRuntimeError({
              operation: "chrome.runtime.sendMessage",
              cause: runtimeError.message || "Unknown error",
            }),
          ),
        );
        return;
      }
      resolve(Result.ok(res as T));
    });
  });
}

export async function getAutoDetection(): Promise<AutoDetection> {
  const res = await sendMessage<AutoDetection>({ type: "get_auto_detection" });
  if (Result.isError(res)) return {};
  const parsed = autoDetectionSchema.safeParse(res.value);
  return parsed.success ? parsed.data : {};
}

export async function requestOnboardingStart(input: {
  baseUrl: string;
  name?: string;
}): Promise<
  Result<{ linkUrl: string; pollToken: string; expiresAt?: string }, PopupOnboardingError>
> {
  const out = await sendMessage<unknown>({
    type: "onboarding_start",
    payload: {
      baseUrl: input.baseUrl,
      name: input.name,
    },
  });

  if (Result.isError(out)) return out;

  const envelope = backgroundEnvelopeSchema.safeParse(out.value);
  if (!envelope.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_start",
        message: "Invalid onboarding envelope from extension background",
      }),
    );
  }
  if (!envelope.data.ok || !envelope.data.value) {
    const message = asString(envelope.data.error) ?? "Onboarding start failed";
    return Result.err(
      new ExtensionInvalidResponseError({ operation: "onboarding_start", message }),
    );
  }

  const payload = onboardingStartValueSchema.safeParse(envelope.data.value);
  if (!payload.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_start",
        message: "Invalid onboarding response from worker",
      }),
    );
  }

  return Result.ok({
    linkUrl: payload.data.telegram_deeplink_url,
    pollToken: payload.data.poll_token,
    expiresAt: payload.data.expires_at,
  });
}

export async function requestOnboardingPoll(input: {
  baseUrl: string;
  pollToken: string;
}): Promise<Result<Record<string, unknown>, PopupOnboardingError>> {
  const out = await sendMessage<unknown>({
    type: "onboarding_poll",
    payload: { baseUrl: input.baseUrl, pollToken: input.pollToken },
  });

  if (Result.isError(out)) return out;
  const envelope = backgroundEnvelopeSchema.safeParse(out.value);
  if (!envelope.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_poll",
        message: "Invalid polling envelope from extension background",
      }),
    );
  }
  if (!envelope.data.ok || !envelope.data.value) {
    const message = asString(envelope.data.error) ?? "Polling failed";
    return Result.err(new ExtensionInvalidResponseError({ operation: "onboarding_poll", message }));
  }

  const payload = onboardingPollValueSchema.safeParse(envelope.data.value);
  if (!payload.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_poll",
        message: "Invalid onboarding poll response shape",
      }),
    );
  }
  return Result.ok(payload.data);
}

export async function requestOnboardingCancel(input: {
  baseUrl: string;
  pollToken: string;
}): Promise<Result<Record<string, unknown>, PopupOnboardingError>> {
  const out = await sendMessage<unknown>({
    type: "onboarding_cancel",
    payload: { baseUrl: input.baseUrl, pollToken: input.pollToken },
  });

  if (Result.isError(out)) return out;
  const envelope = backgroundEnvelopeSchema.safeParse(out.value);
  if (!envelope.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_cancel",
        message: "Invalid cancel envelope from extension background",
      }),
    );
  }
  if (!envelope.data.ok) {
    const message = asString(envelope.data.error) ?? "Cancel failed";
    return Result.err(
      new ExtensionInvalidResponseError({ operation: "onboarding_cancel", message }),
    );
  }

  const value = envelope.data.value;
  if (value && (typeof value !== "object" || Array.isArray(value))) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "onboarding_cancel",
        message: "Invalid cancel response payload",
      }),
    );
  }
  return Result.ok((value as Record<string, unknown> | undefined) ?? {});
}

export async function requestSessionAutoConnect(input: {
  baseUrl: string;
  apiToken: string;
  courseraUserId?: number;
  degreeIds?: string[];
}): Promise<Result<z.infer<typeof sessionAutoConnectResponseSchema>, PopupOnboardingError>> {
  const out = await sendMessage<unknown>({
    type: "session_auto_connect",
    payload: {
      baseUrl: input.baseUrl,
      apiToken: input.apiToken,
      courseraUserId: input.courseraUserId,
      degreeIds: input.degreeIds,
    },
  });
  if (Result.isError(out)) return out;
  const payload = sessionAutoConnectResponseSchema.safeParse(out.value);
  if (!payload.success) {
    return Result.err(
      new ExtensionInvalidResponseError({
        operation: "session_auto_connect",
        message: "Invalid session connect response from extension background",
      }),
    );
  }
  return Result.ok(payload.data);
}

export async function openTelegramLink(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

export async function openCourseraDegrees(): Promise<void> {
  await chrome.tabs.create({
    url: "https://www.coursera.org/degrees/",
  });
}

export async function requestDevRegister(input: {
  baseUrl: string;
  name: string;
  telegramChatId: string;
}): Promise<Result<RegisterResponse, PopupApiError>> {
  return callApi<RegisterResponse>(
    {
      baseUrl: input.baseUrl,
      path: "/api/register",
      method: "POST",
      body: {
        name: input.name,
        telegram_chat_id: input.telegramChatId,
      },
    },
    registerResponseSchema,
  );
}

export function requestFetchNow(input: {
  baseUrl: string;
  token: string;
}): Promise<Result<z.infer<typeof fetchNowResponseSchema>, PopupApiError>> {
  return callApi(
    {
      baseUrl: input.baseUrl,
      path: "/api/fetch-now",
      method: "POST",
      token: input.token,
    },
    fetchNowResponseSchema,
  );
}

export function requestStatus(input: {
  baseUrl: string;
  token: string;
}): Promise<Result<z.infer<typeof statusResponseSchema>, PopupApiError>> {
  return callApi(
    {
      baseUrl: input.baseUrl,
      path: "/api/status",
      method: "GET",
      token: input.token,
    },
    statusResponseSchema,
  );
}
