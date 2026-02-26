import { Result } from "better-result";
import {
  ExtensionHttpError,
  ExtensionRuntimeError,
  MissingDetectionError,
} from "@/lib/core/errors";
import {
  detectionPayloadSchema,
  onboardingCancelPayloadSchema,
  onboardingPollPayloadSchema,
  onboardingStartPayloadSchema,
  uploadPayloadSchema,
} from "@/lib/core/schemas";
import type * as z from "zod/mini";

const COURSERA_COOKIE_DOMAIN = "coursera.org";
const CALENDAR_API_URL_MATCH =
  "https://www.coursera.org/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar*";

type BackgroundError = ExtensionRuntimeError | ExtensionHttpError | MissingDetectionError;

type DetectionPayload = z.infer<typeof detectionPayloadSchema>;
type UploadPayload = z.infer<typeof uploadPayloadSchema>;
type OnboardingStartPayload = z.infer<typeof onboardingStartPayloadSchema>;
type OnboardingPollPayload = z.infer<typeof onboardingPollPayloadSchema>;
type OnboardingCancelPayload = z.infer<typeof onboardingCancelPayloadSchema>;

type PendingAutoSessionConnect = {
  baseUrl: string;
  apiToken: string;
  updatedAt: string;
};

type SessionUploadSuccess = {
  ok: true;
  cookiesCaptured: number;
  encodedSize: unknown;
  courseraUserId: number;
  degreeIds: string[];
};

type MappedCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
};

type WebRequestBodyDetails = chrome.webRequest.OnBeforeRequestDetails & {
  requestBody?: {
    error?: string;
    formData?: Record<string, string[]>;
    raw?: Array<{ bytes?: ArrayBuffer }>;
  };
};

function valueToText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  return null;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getLocal(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (value: Record<string, unknown>) => resolve(value || {}));
  });
}

function setLocal(patch: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(patch, () => resolve());
  });
}

function getAllCookies(): Promise<Result<chrome.cookies.Cookie[], ExtensionRuntimeError>> {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: COURSERA_COOKIE_DOMAIN }, (cookies) => {
      if (chrome.runtime.lastError) {
        resolve(
          Result.err(
            new ExtensionRuntimeError({
              operation: "chrome.cookies.getAll",
              cause: chrome.runtime.lastError.message || "Unknown error",
            }),
          ),
        );
        return;
      }
      resolve(Result.ok(cookies || []));
    });
  });
}

function findCookie(
  cookies: chrome.cookies.Cookie[],
  name: string,
): chrome.cookies.Cookie | undefined {
  return cookies.find((cookie) => cookie.name === name);
}

function mapCookie(cookie: chrome.cookies.Cookie): MappedCookie {
  return {
    name: String(cookie.name),
    value: String(cookie.value),
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expirationDate,
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: cookie.sameSite,
  };
}

function parseCourseraUserIdFromCookies(cookies: chrome.cookies.Cookie[]): number | null {
  const encoded = cookies.find((cookie) => String(cookie.name).startsWith("ab.storage.userId."));
  if (!encoded || !encoded.value) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(String(encoded.value));
  } catch {
    return null;
  }

  const match = decoded.match(/g:([0-9]+)/);
  return match ? Number(match[1]) : null;
}

function concatBytes(buffers: ArrayBuffer[]): Uint8Array {
  const chunks = buffers.map((buffer) => new Uint8Array(buffer));
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function decodeRequestBody(rawBuffers: ArrayBuffer[]): Record<string, unknown> | null {
  let text: string;
  try {
    const bytes = concatBytes(rawBuffers);
    text = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractDetectionPayload(
  details: chrome.webRequest.OnBeforeRequestDetails,
): DetectionPayload | null {
  const withBody = details as WebRequestBodyDetails;
  const rawBuffers = (withBody.requestBody?.raw ?? [])
    .map((entry) => entry.bytes)
    .filter((bytes): bytes is ArrayBuffer => bytes instanceof ArrayBuffer);
  if (rawBuffers.length > 0) {
    const body = decodeRequestBody(rawBuffers);
    if (!body) return null;
    const parsed = detectionPayloadSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  }

  const formData = withBody.requestBody?.formData;
  const parsed = detectionPayloadSchema.safeParse({
    userId: formData?.userId?.[0],
    degreeId: formData?.degreeId?.[0],
  });
  return parsed.success ? parsed.data : null;
}

function isDetectionMissingError(error: BackgroundError): boolean {
  return MissingDetectionError.is(error);
}

async function persistAutoDetection(payload: DetectionPayload): Promise<void> {
  const current = await getLocal(["autoCourseraUserId", "autoDegreeIds"]);
  const existingDegreeIds = Array.isArray(current.autoDegreeIds) ? current.autoDegreeIds : [];
  const merged = new Set(existingDegreeIds.map((id) => String(id)));
  if (payload.degreeId) merged.add(payload.degreeId);

  await setLocal({
    autoCourseraUserId: payload.userId,
    autoDegreeIds: Array.from(merged),
    autoDetectedAt: new Date().toISOString(),
  });

  await maybeTriggerPendingAutoSessionConnect();
}

async function resolveTargets(
  payload: UploadPayload,
  cookies: chrome.cookies.Cookie[],
): Promise<{ courseraUserId: number; degreeIds: string[] }> {
  const current = await getLocal(["autoCourseraUserId", "autoDegreeIds"]);

  let courseraUserId = Number(payload.courseraUserId);
  if (!Number.isFinite(courseraUserId) || courseraUserId <= 0) {
    courseraUserId = Number(current.autoCourseraUserId);
  }
  if (!Number.isFinite(courseraUserId) || courseraUserId <= 0) {
    const parsed = parseCourseraUserIdFromCookies(cookies);
    if (parsed) courseraUserId = parsed;
  }

  let degreeIds = Array.isArray(payload.degreeIds)
    ? payload.degreeIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (degreeIds.length === 0) {
    degreeIds = Array.isArray(current.autoDegreeIds)
      ? current.autoDegreeIds.map((x) => String(x))
      : [];
  }

  return { courseraUserId, degreeIds };
}

async function uploadSession(
  payload: UploadPayload,
): Promise<Result<SessionUploadSuccess, BackgroundError>> {
  const cookiesResult = await getAllCookies();
  if (Result.isError(cookiesResult)) return cookiesResult;
  const cookies = cookiesResult.value;

  if (cookies.length === 0) {
    return Result.err(
      new ExtensionRuntimeError({
        operation: "upload-session",
        cause: "No Coursera cookies found. Make sure you are logged in on coursera.org.",
      }),
    );
  }

  const csrfCookie = findCookie(cookies, "CSRF3-Token");
  if (!csrfCookie || !csrfCookie.value) {
    return Result.err(
      new ExtensionRuntimeError({
        operation: "upload-session",
        cause: "Missing CSRF3-Token cookie. Open Coursera and refresh once, then retry.",
      }),
    );
  }

  const targets = await resolveTargets(payload, cookies);
  if (!Number.isFinite(targets.courseraUserId) || targets.courseraUserId <= 0) {
    return Result.err(new MissingDetectionError({ kind: "userId" }));
  }
  if (targets.degreeIds.length === 0) {
    return Result.err(new MissingDetectionError({ kind: "degreeId" }));
  }

  const body = {
    cookies: cookies.map(mapCookie),
    csrf3Token: String(csrfCookie.value),
    courseraUserId: targets.courseraUserId,
    degreeIds: targets.degreeIds,
  };

  const responseResult = await Result.tryPromise({
    try: () =>
      fetch(`${payload.baseUrl}/api/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${payload.apiToken}`,
        },
        body: JSON.stringify(body),
      }),
    catch: (cause) => new ExtensionRuntimeError({ operation: "upload-session:request", cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  const textResult = await Result.tryPromise({
    try: () => responseResult.value.text(),
    catch: (cause) => new ExtensionRuntimeError({ operation: "upload-session:read-body", cause }),
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
    const reason = valueToText(json.error) ?? valueToText(json.raw) ?? undefined;
    return Result.err(
      new ExtensionHttpError({
        operation: "upload-session",
        status: responseResult.value.status,
        body: json,
        reason,
      }),
    );
  }

  return Result.ok({
    ok: true,
    cookiesCaptured: cookies.length,
    encodedSize: json.encoded_size,
    courseraUserId: targets.courseraUserId,
    degreeIds: targets.degreeIds,
  });
}

async function callWorkerJson(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
}): Promise<Result<Record<string, unknown>, ExtensionRuntimeError | ExtensionHttpError>> {
  const operation = `${input.method} ${input.path}`;
  const responseResult = await Result.tryPromise({
    try: () =>
      fetch(`${input.baseUrl}${input.path}`, {
        method: input.method,
        headers: { "content-type": "application/json" },
        body: input.body ? JSON.stringify(input.body) : undefined,
      }),
    catch: (cause) =>
      new ExtensionRuntimeError({ operation: `worker-json:${operation}:request`, cause }),
  });
  if (Result.isError(responseResult)) return responseResult;

  const textResult = await Result.tryPromise({
    try: () => responseResult.value.text(),
    catch: (cause) =>
      new ExtensionRuntimeError({ operation: `worker-json:${operation}:read-body`, cause }),
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
    const reason = valueToText(json.error) ?? valueToText(json.raw) ?? undefined;
    return Result.err(
      new ExtensionHttpError({
        operation: `worker-json:${operation}`,
        status: responseResult.value.status,
        body: json,
        reason,
      }),
    );
  }

  return Result.ok(json);
}

async function getAutoDetection(): Promise<{
  courseraUserId: number | null;
  degreeIds: string[];
  detectedAt: string | null;
}> {
  const value = await getLocal(["autoCourseraUserId", "autoDegreeIds", "autoDetectedAt"]);
  return {
    courseraUserId: value.autoCourseraUserId ? Number(value.autoCourseraUserId) : null,
    degreeIds: Array.isArray(value.autoDegreeIds) ? value.autoDegreeIds.map((x) => String(x)) : [],
    detectedAt: valueToText(value.autoDetectedAt),
  };
}

async function maybeTriggerPendingAutoSessionConnect(): Promise<void> {
  const value = await getLocal(["pendingAutoSessionConnect"]);
  const pending = value.pendingAutoSessionConnect;
  if (!pending || typeof pending !== "object") return;

  const payload = pending as Partial<PendingAutoSessionConnect>;
  if (typeof payload.baseUrl !== "string" || typeof payload.apiToken !== "string") return;

  const uploadResult = await uploadSession({
    baseUrl: payload.baseUrl,
    apiToken: payload.apiToken,
  });

  if (Result.isOk(uploadResult)) {
    await setLocal({
      hasSession: true,
      pendingAutoSessionConnect: null,
      lastStatus: { connect: uploadResult.value },
      lastStatusAt: new Date().toISOString(),
      courseraUserId: uploadResult.value.courseraUserId,
      degreeIds: uploadResult.value.degreeIds,
    });
  }
}

export default defineBackground(() => {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const payload = extractDetectionPayload(details);
      if (!payload) return undefined;
      void persistAutoDetection(payload);
      return undefined;
    },
    { urls: [CALENDAR_API_URL_MATCH] },
    ["requestBody"],
  );

  chrome.runtime.onMessage.addListener(
    (
      msg: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => {
      if (!msg || typeof msg !== "object") return;

      const typedMsg = msg as { type?: string; payload?: unknown };

      if (
        typedMsg.type === "capture_and_upload_session" ||
        typedMsg.type === "session_auto_connect"
      ) {
        const parsedPayload = uploadPayloadSchema.safeParse(typedMsg.payload);
        if (!parsedPayload.success) {
          sendResponse({ ok: false, error: "Invalid capture payload" });
          return;
        }
        const uploadPayload = parsedPayload.data;

        void (async () => {
          try {
            const out = await uploadSession(uploadPayload);
            if (Result.isOk(out)) {
              await setLocal({
                hasSession: true,
                pendingAutoSessionConnect: null,
                lastStatus: { connect: out.value },
                lastStatusAt: new Date().toISOString(),
                courseraUserId: out.value.courseraUserId,
                degreeIds: out.value.degreeIds,
              });
              sendResponse(out.value);
              return;
            }

            if (typedMsg.type === "session_auto_connect" && isDetectionMissingError(out.error)) {
              const pending: PendingAutoSessionConnect = {
                baseUrl: uploadPayload.baseUrl,
                apiToken: uploadPayload.apiToken,
                updatedAt: new Date().toISOString(),
              };
              await setLocal({
                hasSession: false,
                pendingAutoSessionConnect: pending,
              });
              sendResponse({ ok: false, error: out.error.message, retrying: true });
              return;
            }

            await setLocal({ hasSession: false });
            sendResponse({ ok: false, error: out.error.message });
          } catch (error) {
            sendResponse({ ok: false, error: errorToMessage(error) });
          }
        })();
        return true;
      }

      if (typedMsg.type === "onboarding_start") {
        const parsedPayload = onboardingStartPayloadSchema.safeParse(typedMsg.payload);
        if (!parsedPayload.success) {
          sendResponse({ ok: false, error: "Invalid onboarding start payload" });
          return;
        }
        const payload: OnboardingStartPayload = parsedPayload.data;

        void (async () => {
          try {
            const out = await callWorkerJson({
              baseUrl: payload.baseUrl,
              path: "/api/onboarding/start",
              method: "POST",
              body: { name: payload.name },
            });
            if (Result.isError(out)) {
              sendResponse({ ok: false, error: out.error.message });
              return;
            }
            sendResponse({ ok: true, value: out.value });
          } catch (error) {
            sendResponse({ ok: false, error: errorToMessage(error) });
          }
        })();
        return true;
      }

      if (typedMsg.type === "onboarding_poll") {
        const parsedPayload = onboardingPollPayloadSchema.safeParse(typedMsg.payload);
        if (!parsedPayload.success) {
          sendResponse({ ok: false, error: "Invalid onboarding poll payload" });
          return;
        }
        const payload: OnboardingPollPayload = parsedPayload.data;

        const pollToken = encodeURIComponent(payload.pollToken);
        void (async () => {
          try {
            const out = await callWorkerJson({
              baseUrl: payload.baseUrl,
              path: `/api/onboarding/status?poll_token=${pollToken}`,
              method: "GET",
            });
            if (Result.isError(out)) {
              sendResponse({ ok: false, error: out.error.message });
              return;
            }
            sendResponse({ ok: true, value: out.value });
          } catch (error) {
            sendResponse({ ok: false, error: errorToMessage(error) });
          }
        })();
        return true;
      }

      if (typedMsg.type === "onboarding_cancel") {
        const parsedPayload = onboardingCancelPayloadSchema.safeParse(typedMsg.payload);
        if (!parsedPayload.success) {
          sendResponse({ ok: false, error: "Invalid onboarding cancel payload" });
          return;
        }
        const payload: OnboardingCancelPayload = parsedPayload.data;

        void (async () => {
          try {
            const out = await callWorkerJson({
              baseUrl: payload.baseUrl,
              path: "/api/onboarding/cancel",
              method: "POST",
              body: { poll_token: payload.pollToken },
            });
            if (Result.isError(out)) {
              sendResponse({ ok: false, error: out.error.message });
              return;
            }
            sendResponse({ ok: true, value: out.value });
          } catch (error) {
            sendResponse({ ok: false, error: errorToMessage(error) });
          }
        })();
        return true;
      }

      if (typedMsg.type === "get_auto_detection") {
        void (async () => {
          try {
            const out = await getAutoDetection();
            sendResponse(out);
          } catch {
            sendResponse({
              courseraUserId: null,
              degreeIds: [],
              detectedAt: null,
            });
          }
        })();
        return true;
      }
    },
  );
});
