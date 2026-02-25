import type { PopupState } from "./types";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

type ApiRequest = {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  token?: string;
  body?: unknown;
};

type State = {
  baseUrl?: string;
  apiToken?: string;
  userId?: string;
  name?: string;
  telegramChatId?: string;
  courseraUserId?: number;
  degreeIds?: string[];
  autoCourseraUserId?: number;
  autoDegreeIds?: string[];
  autoDetectedAt?: string;
  lastStatus?: unknown;
  lastStatusAt?: string;
  hasSession?: boolean;
  reauthRequired?: boolean;
  onboardingPollToken?: string;
  onboardingLinkUrl?: string;
  onboardingExpiresAt?: string;
};

type AutoDetection = {
  courseraUserId?: number | null;
  degreeIds?: string[];
  detectedAt?: string | null;
};

type RegisterResponse = {
  api_token: string;
  user_id: string;
};

type OnboardingStartResponse = {
  telegram_deeplink_url?: unknown;
  poll_token?: unknown;
  expires_at?: unknown;
};

type DevKnobs = {
  baseUrlInput: HTMLInputElement;
  userIdInput: HTMLInputElement;
  degreeIdsInput: HTMLInputElement;
  telegramChatIdInput: HTMLInputElement;
};

const DEFAULT_BASE_URL =
  typeof __WORKER_BASE_URL__ === "string" ? __WORKER_BASE_URL__ : "http://127.0.0.1:8787";
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
];

let devKnobs: DevKnobs | null = null;
let pollIntervalId: number | null = null;
let pollInFlight = false;

export function deriveStatusLabel(input: PopupState): string {
  if (input.reauthRequired) return "Reconnect needed";
  if (input.hasToken && input.hasSession) return "Connected";
  return "Not connected";
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required popup element not found: #${id}`);
  return el as T;
}

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err(error: string): Err {
  return { ok: false, error };
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message;
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item) ?? "").filter(Boolean) : [];
}

function getInputValue(id: string): string {
  return byId<HTMLInputElement>(id).value.trim();
}

function parseDegreeIds(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function setBanner(message: string, kind?: "ok" | "error" | ""): void {
  const el = byId("status-banner");
  el.textContent = message;
  el.className = kind || "";
}

function setButtonDisabled(id: string, disabled: boolean): void {
  byId<HTMLButtonElement>(id).disabled = disabled;
}

function mountDevKnobs(): void {
  if (!__DEV_KNOBS__) return;

  const root = byId("dev-knobs-root");
  root.innerHTML = `
    <section class="card" id="dev-card">
      <strong>Dev Manual Controls</strong>
      <div class="row">
        <label for="dev-base-url">Worker Base URL</label>
        <input id="dev-base-url" type="text" placeholder="http://127.0.0.1:8787" />
      </div>
      <div class="row">
        <label for="dev-telegram-chat-id">Telegram Chat ID (manual register)</label>
        <input id="dev-telegram-chat-id" type="text" placeholder="5554014503" />
      </div>
      <div class="row">
        <label for="dev-coursera-user-id">Coursera User ID (optional override)</label>
        <input id="dev-coursera-user-id" type="number" placeholder="144497456" />
      </div>
      <div class="row">
        <label for="dev-degree-ids">Degree IDs (comma-separated, optional override)</label>
        <input id="dev-degree-ids" type="text" placeholder="base~TN5kB6C5TC-GO9O2tK-0CQ" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <button id="dev-register-btn" class="secondary" type="button">Dev Register</button>
        <button id="dev-connect-btn" class="secondary" type="button">Dev Connect</button>
      </div>
      <button id="dev-cancel-onboarding-btn" class="secondary" type="button">Cancel Pending Onboarding</button>
    </section>
  `;

  devKnobs = {
    baseUrlInput: byId<HTMLInputElement>("dev-base-url"),
    userIdInput: byId<HTMLInputElement>("dev-coursera-user-id"),
    degreeIdsInput: byId<HTMLInputElement>("dev-degree-ids"),
    telegramChatIdInput: byId<HTMLInputElement>("dev-telegram-chat-id"),
  };

  byId("dev-register-btn").addEventListener("click", () => void onDevRegister());
  byId("dev-connect-btn").addEventListener("click", () => void connectCourseraSession());
  byId("dev-cancel-onboarding-btn").addEventListener("click", () => void cancelOnboarding());
}

function getConfiguredBaseUrl(state?: State): string {
  if (__DEV_KNOBS__ && devKnobs) {
    const fromInput = devKnobs.baseUrlInput.value.trim();
    if (fromInput) return fromInput;
  }
  const fromState = state?.baseUrl?.trim();
  return fromState || DEFAULT_BASE_URL;
}

function getManualOverrides(): { courseraUserId?: number; degreeIds?: string[] } {
  if (!(__DEV_KNOBS__ && devKnobs)) return {};

  const userIdValue = devKnobs.userIdInput.value.trim();
  const parsedUserId = userIdValue ? Number(userIdValue) : NaN;
  const courseraUserId = Number.isFinite(parsedUserId) && parsedUserId > 0 ? parsedUserId : undefined;

  const degreeIds = parseDegreeIds(devKnobs.degreeIdsInput.value.trim());
  return {
    courseraUserId,
    degreeIds: degreeIds.length > 0 ? degreeIds : undefined,
  };
}

async function getState(): Promise<State> {
  return (await chrome.storage.local.get(KEYS as (keyof State)[])) as State;
}

async function setState(patch: Partial<State>): Promise<void> {
  await chrome.storage.local.set(patch);
}

async function callApi<T extends Record<string, unknown> = Record<string, unknown>>(
  input: ApiRequest,
): Promise<Result<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.token) headers.authorization = `Bearer ${input.token}`;

  let res: Response;
  try {
    res = await fetch(`${input.baseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
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
    const message = asString(json.error) ?? asString(json.raw) ?? `HTTP ${res.status}`;
    return err(message);
  }
  return ok(json as T);
}

function sendMessage<T = unknown>(msg: Record<string, unknown>): Promise<Result<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res: T) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve(err(runtimeError.message || "Unknown error"));
        return;
      }
      resolve(ok(res));
    });
  });
}

async function getAutoDetection(): Promise<AutoDetection> {
  const res = await sendMessage<AutoDetection>({ type: "get_auto_detection" });
  return res.ok ? res.value || {} : {};
}

function startOnboardingPolling(): void {
  stopOnboardingPolling();
  void pollOnboardingStatus();
  pollIntervalId = window.setInterval(() => {
    void pollOnboardingStatus();
  }, 2000);
}

function stopOnboardingPolling(): void {
  if (pollIntervalId !== null) {
    window.clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

async function openTelegramLink(url: string): Promise<void> {
  await chrome.tabs.create({ url });
}

async function startOnboarding(): Promise<void> {
  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);
  const name = getInputValue("display-name") || state.name || undefined;

  setBanner("Creating secure Telegram link...", "");
  const out = await sendMessage<{ ok?: unknown; value?: OnboardingStartResponse; error?: unknown }>({
    type: "onboarding_start",
    payload: {
      baseUrl,
      name,
    },
  });

  if (!out.ok) {
    setBanner(`Onboarding failed: ${out.error}`, "error");
    return;
  }

  const okValue = Boolean(out.value?.ok);
  if (!okValue || !out.value?.value) {
    const message = asString(out.value?.error) ?? "Onboarding start failed";
    setBanner(message, "error");
    return;
  }

  const response = out.value.value;
  const linkUrl = asString(response.telegram_deeplink_url);
  const pollToken = asString(response.poll_token);
  const expiresAt = asString(response.expires_at);

  if (!linkUrl || !pollToken) {
    setBanner("Invalid onboarding response from worker", "error");
    return;
  }

  await setState({
    baseUrl,
    name,
    onboardingLinkUrl: linkUrl,
    onboardingPollToken: pollToken,
    onboardingExpiresAt: expiresAt ?? undefined,
  });

  await openTelegramLink(linkUrl);
  setBanner("Telegram link opened. Send /start in the bot chat.", "ok");
  startOnboardingPolling();
  await refreshUi();
}

async function cancelOnboarding(): Promise<void> {
  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);
  const pollToken = state.onboardingPollToken?.trim();
  if (!pollToken) {
    setBanner("No pending onboarding to cancel", "error");
    return;
  }

  const out = await sendMessage<{ ok?: unknown; error?: unknown }>({
    type: "onboarding_cancel",
    payload: { baseUrl, pollToken },
  });

  if (!out.ok) {
    setBanner(`Cancel failed: ${out.error}`, "error");
    return;
  }

  await setState({
    onboardingPollToken: undefined,
    onboardingLinkUrl: undefined,
    onboardingExpiresAt: undefined,
  });
  stopOnboardingPolling();
  setBanner("Pending onboarding cancelled", "ok");
  await refreshUi();
}

async function pollOnboardingStatus(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    const state = await getState();
    const baseUrl = getConfiguredBaseUrl(state);
    const pollToken = state.onboardingPollToken?.trim();

    if (!pollToken) {
      stopOnboardingPolling();
      return;
    }

    const out = await sendMessage<{ ok?: unknown; value?: Record<string, unknown>; error?: unknown }>({
      type: "onboarding_poll",
      payload: { baseUrl, pollToken },
    });

    if (!out.ok) {
      setBanner(`Polling failed: ${out.error}`, "error");
      return;
    }

    if (!out.value?.ok || !out.value?.value) {
      const message = asString(out.value?.error) ?? "Polling failed";
      setBanner(message, "error");
      return;
    }

    const statusPayload = out.value.value;
    const status = asString(statusPayload.status) ?? "pending";

    if (status === "pending") {
      await refreshUi();
      return;
    }

    if (status === "linked") {
      const apiToken = asString(statusPayload.api_token);
      const userId = asString(statusPayload.user_id);
      const telegramChatId = asString(statusPayload.telegram_chat_id);
      const name = asString(statusPayload.name);

      if (!apiToken || !userId) {
        setBanner("Linked status missing api token/user id", "error");
        return;
      }

      await setState({
        apiToken,
        userId,
        telegramChatId: telegramChatId ?? undefined,
        name: name ?? undefined,
        hasSession: false,
        onboardingPollToken: undefined,
        onboardingLinkUrl: undefined,
        onboardingExpiresAt: undefined,
      });
      stopOnboardingPolling();
      setBanner("Telegram connected. Connecting Coursera session...", "ok");
      await connectCourseraSession(true);
      return;
    }

    if (status === "expired" || status === "cancelled") {
      await setState({
        onboardingPollToken: undefined,
        onboardingLinkUrl: undefined,
        onboardingExpiresAt: undefined,
      });
      stopOnboardingPolling();
      setBanner("Onboarding link expired. Generate a new link.", "error");
      await refreshUi();
      return;
    }

    setBanner(`Unexpected onboarding status: ${status}`, "error");
  } finally {
    pollInFlight = false;
  }
}

async function onPrimaryAction(): Promise<void> {
  const state = await getState();

  if (!state.apiToken) {
    if (state.onboardingPollToken && state.onboardingLinkUrl) {
      await openTelegramLink(state.onboardingLinkUrl);
      setBanner("Telegram link reopened", "ok");
      startOnboardingPolling();
      return;
    }
    await startOnboarding();
    return;
  }

  if (!state.hasSession || state.reauthRequired) {
    await connectCourseraSession();
    return;
  }

  await onFetchNow();
}

async function connectCourseraSession(fromAuto = false): Promise<void> {
  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);
  if (!state.apiToken) {
    setBanner("Connect Telegram first", "error");
    return;
  }

  const overrides = getManualOverrides();
  const payload: Record<string, unknown> = {
    baseUrl,
    apiToken: state.apiToken,
  };
  if (overrides.courseraUserId) payload.courseraUserId = overrides.courseraUserId;
  if (overrides.degreeIds) payload.degreeIds = overrides.degreeIds;

  setBanner(fromAuto ? "Connecting Coursera session..." : "Capturing Coursera session...", "");

  const out = await sendMessage<Record<string, unknown>>({
    type: "session_auto_connect",
    payload,
  });

  if (!out.ok) {
    setBanner(`Session connect failed: ${out.error}`, "error");
    return;
  }

  const value = out.value;
  if (value && value.ok) {
    await setState({
      hasSession: true,
      reauthRequired: false,
      courseraUserId: asNumber(value.courseraUserId) ?? undefined,
      degreeIds: asStringArray(value.degreeIds),
      lastStatus: { connect: value },
      lastStatusAt: new Date().toISOString(),
    });
    const cookiesCaptured = asString(value.cookiesCaptured) ?? "0";
    setBanner(`Session uploaded (${cookiesCaptured} cookies)`, "ok");
    await refreshUi();
    return;
  }

  const retrying = Boolean(value?.retrying);
  const message = asString(value?.error) ?? "session upload failed";
  await setState({
    hasSession: false,
    lastStatus: { connect: value },
    lastStatusAt: new Date().toISOString(),
  });
  if (retrying) {
    setBanner(`Waiting for Coursera detection: ${message}`, "");
  } else {
    setBanner(`Connect failed: ${message}`, "error");
  }
  await refreshUi();
}

async function onFetchNow(): Promise<void> {
  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);

  if (!state.apiToken) {
    setBanner("Connect Telegram first", "error");
    return;
  }

  setBanner("Running fetch-now...", "");
  const out = await callApi({
    baseUrl,
    path: "/api/fetch-now",
    method: "POST",
    token: state.apiToken,
  });
  if (!out.ok) {
    setBanner(`Fetch failed: ${out.error}`, "error");
    return;
  }

  await setState({ lastStatus: { fetch: out.value }, lastStatusAt: new Date().toISOString() });
  const itemsSeen = asString(out.value.items_seen) ?? "0";
  const eventsCreated = asString(out.value.events_created) ?? "0";
  setBanner(`Fetch complete (items=${itemsSeen}, events=${eventsCreated})`, "ok");
  await refreshUi();
}

async function onRefreshStatus(): Promise<void> {
  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);

  if (!state.apiToken) {
    setBanner("Connect Telegram first", "error");
    return;
  }

  setBanner("Loading status...", "");
  const out = await callApi({
    baseUrl,
    path: "/api/status",
    method: "GET",
    token: state.apiToken,
  });
  if (!out.ok) {
    setBanner(`Status failed: ${out.error}`, "error");
    return;
  }

  await setState({
    lastStatus: { status: out.value },
    lastStatusAt: new Date().toISOString(),
    reauthRequired: Boolean(out.value.reauth_required),
  });
  setBanner("Status refreshed", "ok");
  await refreshUi();
}

async function onOpenCoursera(): Promise<void> {
  await chrome.tabs.create({
    url: "https://www.coursera.org/degrees/",
  });
}

async function onDevRegister(): Promise<void> {
  if (!(__DEV_KNOBS__ && devKnobs)) return;

  const state = await getState();
  const baseUrl = getConfiguredBaseUrl(state);
  const name = getInputValue("display-name") || state.name || "User";
  const telegramChatId = devKnobs.telegramChatIdInput.value.trim();
  if (!telegramChatId) {
    setBanner("Dev register requires Telegram Chat ID", "error");
    return;
  }

  const out = await callApi<RegisterResponse>({
    baseUrl,
    path: "/api/register",
    method: "POST",
    body: {
      name,
      telegram_chat_id: telegramChatId,
    },
  });
  if (!out.ok) {
    setBanner(`Dev register failed: ${out.error}`, "error");
    return;
  }

  await setState({
    baseUrl,
    name,
    telegramChatId,
    apiToken: out.value.api_token,
    userId: out.value.user_id,
  });
  setBanner("Dev register complete", "ok");
  await refreshUi();
}

async function refreshUi(): Promise<void> {
  const state = await getState();
  const auto = await getAutoDetection();

  const nameInput = byId<HTMLInputElement>("display-name");
  if (!nameInput.value && state.name) {
    nameInput.value = state.name;
  }

  const detectedUserId = Number(auto.courseraUserId || state.autoCourseraUserId || 0);
  const detectedDegreeIds = Array.isArray(auto.degreeIds)
    ? auto.degreeIds
    : Array.isArray(state.autoDegreeIds)
      ? state.autoDegreeIds
      : [];

  if (__DEV_KNOBS__ && devKnobs) {
    devKnobs.baseUrlInput.value = state.baseUrl || DEFAULT_BASE_URL;
    if (!devKnobs.userIdInput.value && (state.courseraUserId || detectedUserId)) {
      devKnobs.userIdInput.value = String(state.courseraUserId || detectedUserId);
    }
    if (!devKnobs.degreeIdsInput.value) {
      const ids =
        Array.isArray(state.degreeIds) && state.degreeIds.length > 0 ? state.degreeIds : detectedDegreeIds;
      devKnobs.degreeIdsInput.value = ids.join(",");
    }
    if (!devKnobs.telegramChatIdInput.value && state.telegramChatId) {
      devKnobs.telegramChatIdInput.value = state.telegramChatId;
    }
  }

  const detectedAt = auto.detectedAt || state.autoDetectedAt;
  const hint = byId("autodetect-hint");
  if (detectedUserId > 0 || detectedDegreeIds.length > 0) {
    hint.textContent = `Auto-detected: userId=${detectedUserId || "?"}, degreeIds=${detectedDegreeIds.join(", ") || "none"}${detectedAt ? ` (${detectedAt})` : ""}`;
  } else {
    hint.textContent = "No auto-detected IDs yet. Open Coursera degree page and refresh.";
  }

  const hasToken = Boolean(state.apiToken);
  const hasSession = Boolean(state.hasSession);
  const isReauthRequired = Boolean(state.reauthRequired);

  const onboardingHint = byId("onboarding-hint");
  const primaryButton = byId<HTMLButtonElement>("onboarding-btn");
  const openTelegramButton = byId<HTMLButtonElement>("open-telegram-btn");

  if (!hasToken) {
    if (state.onboardingPollToken) {
      primaryButton.textContent = "Continue Telegram Link";
      onboardingHint.textContent = state.onboardingExpiresAt
        ? `Waiting for Telegram confirmation (expires ${state.onboardingExpiresAt})`
        : "Waiting for Telegram confirmation";
      openTelegramButton.classList.toggle("hidden", !state.onboardingLinkUrl);
      if (state.onboardingLinkUrl) {
        startOnboardingPolling();
      }
    } else {
      primaryButton.textContent = "Connect Telegram";
      onboardingHint.textContent = "Connect Telegram to begin one-click setup.";
      openTelegramButton.classList.add("hidden");
      stopOnboardingPolling();
    }
  } else if (!hasSession || isReauthRequired) {
    primaryButton.textContent = isReauthRequired ? "Reconnect Coursera" : "Connect Coursera Session";
    onboardingHint.textContent =
      "Telegram linked. Open Coursera degree page once; session will connect automatically.";
    openTelegramButton.classList.add("hidden");
    stopOnboardingPolling();
  } else {
    primaryButton.textContent = "Sync Now";
    onboardingHint.textContent = "Connected. Run a sync to check latest deadlines.";
    openTelegramButton.classList.add("hidden");
    stopOnboardingPolling();
  }

  const tokenPreview = state.apiToken ? `${state.apiToken.slice(0, 10)}...` : "Not linked";
  byId("token-hint").textContent = state.apiToken
    ? `user_id=${state.userId || "?"} token=${tokenPreview}`
    : "Not registered";

  byId("status-view").textContent = state.lastStatus
    ? `${state.lastStatusAt || ""}\n${JSON.stringify(state.lastStatus, null, 2)}`
    : "No status yet.";

  setButtonDisabled("fetch-btn", !hasToken);
  setButtonDisabled("status-btn", !hasToken);
}

async function bootstrap(): Promise<void> {
  const requiredIds = [
    "status-banner",
    "display-name",
    "onboarding-btn",
    "open-telegram-btn",
    "onboarding-hint",
    "autodetect-hint",
    "open-coursera-btn",
    "token-hint",
    "status-view",
    "fetch-btn",
    "status-btn",
    "dev-knobs-root",
  ];
  for (const id of requiredIds) {
    byId(id);
  }

  mountDevKnobs();

  byId("onboarding-btn").addEventListener("click", () => void onPrimaryAction());
  byId("open-telegram-btn").addEventListener("click", async () => {
    const state = await getState();
    if (!state.onboardingLinkUrl) {
      setBanner("No Telegram onboarding link in state", "error");
      return;
    }
    await openTelegramLink(state.onboardingLinkUrl);
  });
  byId("open-coursera-btn").addEventListener("click", () => void onOpenCoursera());
  byId("fetch-btn").addEventListener("click", () => void onFetchNow());
  byId("status-btn").addEventListener("click", () => void onRefreshStatus());

  await refreshUi();
  setBanner("Ready", "");
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    stopOnboardingPolling();
  });
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  void bootstrap().catch((error: unknown) => {
    console.error("Popup bootstrap failed", error);
  });
}
