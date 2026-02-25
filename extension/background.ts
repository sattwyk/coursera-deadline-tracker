const COURSERA_COOKIE_DOMAIN = "coursera.org";
const CALENDAR_API_URL_MATCH =
  "https://www.coursera.org/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar*";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

type DetectionPayload = {
  userId: number;
  degreeId: string;
};

type UploadPayload = {
  baseUrl: string;
  apiToken: string;
  courseraUserId?: number;
  degreeIds?: string[];
};

type OnboardingStartPayload = {
  baseUrl: string;
  name?: string;
};

type OnboardingPollPayload = {
  baseUrl: string;
  pollToken: string;
};

type OnboardingCancelPayload = {
  baseUrl: string;
  pollToken: string;
};

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

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err(error: string): Err {
  return { ok: false, error };
}

function valueToText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  return null;
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

function getAllCookies(): Promise<Result<chrome.cookies.Cookie[]>> {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: COURSERA_COOKIE_DOMAIN }, (cookies) => {
      if (chrome.runtime.lastError) {
        resolve(err(chrome.runtime.lastError.message || "Unknown error"));
        return;
      }
      resolve(ok(cookies || []));
    });
  });
}

function findCookie(cookies: chrome.cookies.Cookie[], name: string): chrome.cookies.Cookie | undefined {
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

  const decodeResult = (() => {
    try {
      return ok(decodeURIComponent(String(encoded.value)));
    } catch {
      return err("decode-failed");
    }
  })();
  if (!decodeResult.ok) return null;

  const match = decodeResult.value.match(/g:([0-9]+)/);
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
  const decodeResult = (() => {
    try {
      const bytes = concatBytes(rawBuffers);
      const text = new TextDecoder().decode(bytes);
      return ok(text);
    } catch {
      return err("decode-failed");
    }
  })();
  if (!decodeResult.ok) return null;

  try {
    return JSON.parse(decodeResult.value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractDetectionPayload(details: chrome.webRequest.OnBeforeRequestDetails): DetectionPayload | null {
  const withBody = details as WebRequestBodyDetails;
  const rawBuffers = (withBody.requestBody?.raw ?? [])
    .map((entry) => entry.bytes)
    .filter((bytes): bytes is ArrayBuffer => bytes instanceof ArrayBuffer);
  if (rawBuffers.length > 0) {
    const body = decodeRequestBody(rawBuffers);
    if (!body) return null;

    const userId = Number(body.userId);
    const degreeId = typeof body.degreeId === "string" ? body.degreeId : null;
    if (!Number.isFinite(userId) || userId <= 0 || !degreeId) return null;
    return { userId, degreeId };
  }

  const formData = withBody.requestBody?.formData;
  const userIdRaw = formData?.userId?.[0];
  const degreeIdRaw = formData?.degreeId?.[0];
  const userId = Number(userIdRaw);
  if (!Number.isFinite(userId) || userId <= 0 || typeof degreeIdRaw !== "string" || !degreeIdRaw) {
    return null;
  }
  return { userId, degreeId: degreeIdRaw };
}

function isUploadPayload(value: unknown): value is UploadPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<UploadPayload>;
  if (typeof payload.baseUrl !== "string" || payload.baseUrl.trim() === "") return false;
  if (typeof payload.apiToken !== "string" || payload.apiToken.trim() === "") return false;
  if (payload.courseraUserId !== undefined && !Number.isFinite(Number(payload.courseraUserId))) return false;
  if (payload.degreeIds !== undefined && !Array.isArray(payload.degreeIds)) return false;
  return true;
}

function isOnboardingStartPayload(value: unknown): value is OnboardingStartPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<OnboardingStartPayload>;
  if (typeof payload.baseUrl !== "string" || payload.baseUrl.trim() === "") return false;
  if (payload.name !== undefined && typeof payload.name !== "string") return false;
  return true;
}

function isOnboardingPollPayload(value: unknown): value is OnboardingPollPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<OnboardingPollPayload>;
  return (
    typeof payload.baseUrl === "string" &&
    payload.baseUrl.trim() !== "" &&
    typeof payload.pollToken === "string" &&
    payload.pollToken.trim() !== ""
  );
}

function isOnboardingCancelPayload(value: unknown): value is OnboardingCancelPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<OnboardingCancelPayload>;
  return (
    typeof payload.baseUrl === "string" &&
    payload.baseUrl.trim() !== "" &&
    typeof payload.pollToken === "string" &&
    payload.pollToken.trim() !== ""
  );
}

function isDetectionMissingError(message: string): boolean {
  return message.includes("Could not detect Coursera user ID") || message.includes("Could not detect degree ID");
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

async function uploadSession(payload: UploadPayload): Promise<Result<SessionUploadSuccess>> {
  const cookiesResult = await getAllCookies();
  if (!cookiesResult.ok) return cookiesResult;
  const cookies = cookiesResult.value;

  if (cookies.length === 0) {
    return err("No Coursera cookies found. Make sure you are logged in on coursera.org.");
  }

  const csrfCookie = findCookie(cookies, "CSRF3-Token");
  if (!csrfCookie || !csrfCookie.value) {
    return err("Missing CSRF3-Token cookie. Open Coursera and refresh once, then retry.");
  }

  const targets = await resolveTargets(payload, cookies);
  if (!Number.isFinite(targets.courseraUserId) || targets.courseraUserId <= 0) {
    return err("Could not detect Coursera user ID. Open a Coursera degree page and refresh once.");
  }
  if (targets.degreeIds.length === 0) {
    return err("Could not detect degree ID. Open a Coursera degree page and refresh once.");
  }

  const body = {
    cookies: cookies.map(mapCookie),
    csrf3Token: String(csrfCookie.value),
    courseraUserId: targets.courseraUserId,
    degreeIds: targets.degreeIds,
  };

  let res: Response;
  try {
    res = await fetch(`${payload.baseUrl}/api/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${payload.apiToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  let text = "";
  try {
    text = await res.text();
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  let json: Record<string, unknown>;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    return err(valueToText(json.error) ?? valueToText(json.raw) ?? `HTTP ${res.status}`);
  }

  return ok({
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
}): Promise<Result<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetch(`${input.baseUrl}${input.path}`, {
      method: input.method,
      headers: { "content-type": "application/json" },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }

  let text = "";
  try {
    text = await res.text();
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }

  let json: Record<string, unknown>;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const message = valueToText(json.error) ?? valueToText(json.raw) ?? `HTTP ${res.status}`;
    return err(message);
  }

  return ok(json);
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

  if (uploadResult.ok) {
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

chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    if (!msg || typeof msg !== "object") return;

    const typedMsg = msg as { type?: string; payload?: unknown };

    if (typedMsg.type === "capture_and_upload_session" || typedMsg.type === "session_auto_connect") {
      if (!isUploadPayload(typedMsg.payload)) {
        sendResponse({ ok: false, error: "Invalid capture payload" });
        return;
      }
      const uploadPayload = typedMsg.payload;

      void uploadSession(uploadPayload)
        .then(async (out) => {
          if (out.ok) {
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
            sendResponse({ ok: false, error: out.error, retrying: true });
            return;
          }

          await setLocal({ hasSession: false });
          sendResponse({ ok: false, error: out.error });
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (typedMsg.type === "onboarding_start") {
      if (!isOnboardingStartPayload(typedMsg.payload)) {
        sendResponse({ ok: false, error: "Invalid onboarding start payload" });
        return;
      }

      void callWorkerJson({
        baseUrl: typedMsg.payload.baseUrl,
        path: "/api/onboarding/start",
        method: "POST",
        body: { name: typedMsg.payload.name },
      })
        .then((out) => {
          if (!out.ok) {
            sendResponse({ ok: false, error: out.error });
            return;
          }
          sendResponse({ ok: true, value: out.value });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (typedMsg.type === "onboarding_poll") {
      if (!isOnboardingPollPayload(typedMsg.payload)) {
        sendResponse({ ok: false, error: "Invalid onboarding poll payload" });
        return;
      }

      const pollToken = encodeURIComponent(typedMsg.payload.pollToken);
      void callWorkerJson({
        baseUrl: typedMsg.payload.baseUrl,
        path: `/api/onboarding/status?poll_token=${pollToken}`,
        method: "GET",
      })
        .then((out) => {
          if (!out.ok) {
            sendResponse({ ok: false, error: out.error });
            return;
          }
          sendResponse({ ok: true, value: out.value });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (typedMsg.type === "onboarding_cancel") {
      if (!isOnboardingCancelPayload(typedMsg.payload)) {
        sendResponse({ ok: false, error: "Invalid onboarding cancel payload" });
        return;
      }

      void callWorkerJson({
        baseUrl: typedMsg.payload.baseUrl,
        path: "/api/onboarding/cancel",
        method: "POST",
        body: { poll_token: typedMsg.payload.pollToken },
      })
        .then((out) => {
          if (!out.ok) {
            sendResponse({ ok: false, error: out.error });
            return;
          }
          sendResponse({ ok: true, value: out.value });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return true;
    }

    if (typedMsg.type === "get_auto_detection") {
      void getAutoDetection()
        .then((out) => sendResponse(out))
        .catch(() =>
          sendResponse({
            courseraUserId: null,
            degreeIds: [],
            detectedAt: null,
          }),
        );
      return true;
    }
  },
);
