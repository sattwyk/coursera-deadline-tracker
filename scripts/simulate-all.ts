type JsonRecord = Record<string, unknown>;

type HttpJson = {
  status: number;
  ok: boolean;
  json: JsonRecord;
  text: string;
};

type SimulationConfig = {
  baseUrl: string;
  name: string;
  chatId: string;
  webhookSecret: string;
  runCommands: boolean;
  inlineStrict: boolean;
  useRealCoursera: boolean;
  courseraUserId: number;
  degreeIds: string[];
  csrf3Token: string;
  cauth: string;
};

const DEADLINE_FILTERS = ["upcoming", "pending", "completed", "overdue", "all"] as const;

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function parseJson(text: string): JsonRecord {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { raw: text };
  }
}

async function requestJson(
  baseUrl: string,
  path: string,
  input?: {
    method?: "GET" | "POST";
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<HttpJson> {
  const method = input?.method ?? "GET";
  const headers: Record<string, string> = { ...input?.headers };
  if (method === "POST") headers["content-type"] = "application/json";
  if (input?.token) headers.authorization = `Bearer ${input.token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: input?.body ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    json: parseJson(text),
    text,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function parseDegreeIds(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mask(token: string): string {
  if (token.length <= 8) return token;
  return `${token.slice(0, 8)}...`;
}

function logStep(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function assertOk(response: HttpJson, label: string): void {
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status}): ${response.text}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseConfig(): SimulationConfig {
  const useRealCoursera = parseBool("SIM_REAL_COURSERA", false);
  const cfg: SimulationConfig = {
    baseUrl: optionalEnv("BASE_URL", "http://127.0.0.1:8787"),
    name: optionalEnv("SIM_NAME", "Simulation User"),
    chatId: requiredEnv("SIM_CHAT_ID"),
    webhookSecret:
      process.env.SIM_WEBHOOK_SECRET?.trim() ?? process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
    runCommands: parseBool("SIM_RUN_COMMANDS", true),
    inlineStrict: parseBool("SIM_INLINE_STRICT", false),
    useRealCoursera,
    courseraUserId: 1,
    degreeIds: ["base~simulation"],
    csrf3Token: "simulation-csrf-token",
    cauth: "simulation-cauth-token",
  };

  if (useRealCoursera) {
    cfg.courseraUserId = Number(requiredEnv("COURSERA_USER_ID"));
    cfg.degreeIds = parseDegreeIds(requiredEnv("DEGREE_IDS"));
    cfg.csrf3Token = requiredEnv("CSRF3_TOKEN");
    cfg.cauth = requiredEnv("CAUTH");
  }

  return cfg;
}

async function main(): Promise<void> {
  const cfg = parseConfig();
  console.log("Simulation config:");
  console.log(`BASE_URL=${cfg.baseUrl}`);
  console.log(`SIM_CHAT_ID=${cfg.chatId}`);
  console.log(`SIM_WEBHOOK_SECRET=${cfg.webhookSecret ? "<set>" : "<empty>"}`);
  console.log(`SIM_RUN_COMMANDS=${cfg.runCommands}`);
  console.log(`SIM_INLINE_STRICT=${cfg.inlineStrict}`);
  console.log(`SIM_REAL_COURSERA=${cfg.useRealCoursera}`);
  const webhookHeaders = cfg.webhookSecret
    ? { "x-telegram-bot-api-secret-token": cfg.webhookSecret }
    : undefined;

  logStep("1) Start onboarding");
  const start = await requestJson(cfg.baseUrl, "/api/onboarding/start", {
    method: "POST",
    body: { name: cfg.name },
  });
  assertOk(start, "onboarding-start");
  const deepLink = asString(start.json.telegram_deeplink_url);
  const pollToken = asString(start.json.poll_token);
  if (!deepLink || !pollToken) {
    throw new Error(`Invalid onboarding-start payload: ${start.text}`);
  }
  const parsedDeepLink = new URL(deepLink);
  const linkCode = parsedDeepLink.searchParams.get("start") ?? "";
  if (!linkCode) {
    throw new Error(`Missing start code in deeplink: ${deepLink}`);
  }
  console.log(`Onboarding link created: ${deepLink}`);

  logStep("2) Simulate Telegram /start");
  const startWebhook = await requestJson(cfg.baseUrl, "/api/telegram/webhook", {
    method: "POST",
    headers: webhookHeaders,
    body: {
      update_id: Date.now(),
      message: {
        chat: { id: cfg.chatId },
        text: `/start ${linkCode}`,
      },
    },
  });
  assertOk(startWebhook, "telegram-webhook /start");
  console.log(`Webhook response: ${JSON.stringify(startWebhook.json)}`);

  logStep("3) Poll onboarding status");
  let apiToken = "";
  let userId = "";
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const status = await requestJson(
      cfg.baseUrl,
      `/api/onboarding/status?poll_token=${encodeURIComponent(pollToken)}`,
    );
    assertOk(status, "onboarding-status");
    const state = asString(status.json.status) ?? "unknown";
    console.log(`Poll #${attempt}: status=${state}`);
    if (state === "linked") {
      apiToken = asString(status.json.api_token) ?? "";
      userId = asString(status.json.user_id) ?? "";
      break;
    }
    if (state === "expired" || state === "cancelled") {
      throw new Error(`Onboarding became ${state}`);
    }
    await sleep(1000);
  }
  if (!apiToken || !userId) {
    throw new Error("Onboarding did not reach linked state in time.");
  }
  console.log(`Linked user_id=${userId} api_token=${mask(apiToken)}`);

  logStep("4) Upload session");
  const session = await requestJson(cfg.baseUrl, "/api/session", {
    method: "POST",
    token: apiToken,
    body: {
      cookies: [
        { name: "CAUTH", value: cfg.cauth, domain: ".coursera.org", path: "/" },
        { name: "CSRF3-Token", value: cfg.csrf3Token, domain: ".coursera.org", path: "/" },
      ],
      csrf3Token: cfg.csrf3Token,
      courseraUserId: cfg.courseraUserId,
      degreeIds: cfg.degreeIds,
    },
  });
  assertOk(session, "session upload");
  console.log(`Session upload response: ${JSON.stringify(session.json)}`);

  logStep("5) Fetch/status");
  const statusBefore = await requestJson(cfg.baseUrl, "/api/status", {
    method: "GET",
    token: apiToken,
  });
  assertOk(statusBefore, "status");
  console.log(`Status: ${JSON.stringify(statusBefore.json)}`);

  const fetchNow = await requestJson(cfg.baseUrl, "/api/fetch-now", {
    method: "POST",
    token: apiToken,
  });
  console.log(`Fetch-now HTTP ${fetchNow.status}: ${fetchNow.text}`);

  logStep("5b) Deadline listings by filter");
  for (const filter of DEADLINE_FILTERS) {
    const listing = await requestJson(
      cfg.baseUrl,
      `/api/deadlines?filter=${encodeURIComponent(filter)}&limit=5`,
      {
        method: "GET",
        token: apiToken,
      },
    );
    if (!listing.ok) {
      console.log(`[${filter}] HTTP ${listing.status}: ${listing.text}`);
      continue;
    }
    const count = asString(listing.json.count) ?? "0";
    console.log(`[${filter}] count=${count}`);
    const items = Array.isArray(listing.json.items) ? listing.json.items : [];
    for (const raw of items) {
      const row = raw as Record<string, unknown>;
      const course = asString(row.courseName) ?? "?";
      const title = asString(row.title) ?? "?";
      const deadline = asString(row.deadlineAt) ?? "?";
      const complete = Boolean(row.isComplete);
      console.log(`  - ${course} | ${title} | ${deadline} | ${complete ? "completed" : "pending"}`);
    }
  }

  if (cfg.runCommands) {
    logStep("6) Simulate Telegram inline query");
    const inlineQuery = await requestJson(cfg.baseUrl, "/api/telegram/webhook", {
      method: "POST",
      headers: webhookHeaders,
      body: {
        update_id: Date.now(),
        inline_query: {
          id: String(Date.now()),
          query: "upcoming",
          from: {
            id: cfg.chatId,
            language_code: "en",
          },
        },
      },
    });
    if (!inlineQuery.ok) {
      if (cfg.inlineStrict) {
        throw new Error(
          `telegram-webhook inline_query failed (HTTP ${inlineQuery.status}): ${inlineQuery.text}`,
        );
      }
      console.log(
        `inline_query warning (expected with fake inline_query.id in local simulation): HTTP ${inlineQuery.status} ${inlineQuery.text}`,
      );
    } else {
      console.log(`inline_query: ${JSON.stringify(inlineQuery.json)}`);
    }

    logStep("7) Simulate Telegram commands");
    const commands = [
      "/help",
      "/status",
      "/list upcoming",
      "/list pending",
      "/list completed",
      "/list all",
      "/settings",
      "/pause",
      "/resume",
      "/mode changed",
      "/tz Asia/Kolkata",
      "/sync",
      "/test",
    ];
    for (const command of commands) {
      const reply = await requestJson(cfg.baseUrl, "/api/telegram/webhook", {
        method: "POST",
        headers: webhookHeaders,
        body: {
          update_id: Date.now(),
          message: {
            chat: { id: cfg.chatId },
            text: command,
          },
        },
      });
      assertOk(reply, `telegram-webhook ${command}`);
      console.log(`${command}: ${JSON.stringify(reply.json)}`);
    }

    logStep("8) Simulate Telegram callback actions");
    const callbacks = [
      "list:upcoming:0",
      "act:sync",
      "act:pause",
      "act:resume",
      "act:mode:changed",
    ];
    for (const data of callbacks) {
      const callback = await requestJson(cfg.baseUrl, "/api/telegram/webhook", {
        method: "POST",
        headers: webhookHeaders,
        body: {
          update_id: Date.now(),
          callback_query: {
            id: `${Date.now()}-${data}`,
            data,
            from: {
              id: cfg.chatId,
              language_code: "en",
            },
            message: {
              message_id: 1,
              chat: { id: cfg.chatId },
            },
          },
        },
      });
      assertOk(callback, `telegram-webhook callback ${data}`);
      console.log(`${data}: ${JSON.stringify(callback.json)}`);
    }
  }

  logStep("Simulation complete");
  console.log("All core flows executed.");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Simulation failed: ${message}`);
  process.exit(1);
});
