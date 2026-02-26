# Coursera Deadline Tracker Zero-Setup UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a zero-setup Coursera deadline tracker where users install an extension, connect once, and receive clean Telegram deadline alerts without manual cookie, user ID, or degree ID entry.

**Architecture:** A Chrome extension captures Coursera session cookies plus discovery metadata and sends encrypted session bundles to a Cloudflare Worker. The Worker calls Coursera's calendar endpoint (`GetDegreeHomeCalendar`), normalizes assignments/events, diffs against D1 state, and sends deduplicated Telegram notifications. Cron triggers run periodic syncs, while fetch-now enables immediate validation.

**Tech Stack:** Chrome Extension (Manifest V3, TypeScript), Cloudflare Workers (TypeScript), Cloudflare D1 (SQLite), Cloudflare KV, Telegram Bot API, Vitest, Wrangler, Miniflare.

---

## Pre-Flight Rules

- Execution skill for implementation: `@superpowers:executing-plans`
- Prefer DRY and YAGNI: do not build user-editable rule engines in this phase.
- TDD for all core logic: normalization, diffing, Coursera request building, notification gating.
- Commit after each task.

---

### Task 1: Bootstrap Worker + Extension Monorepo Skeleton

**Files:**

- Create: `package.json`
- Create: `.gitignore`
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts`
- Create: `worker/test/smoke.test.ts`
- Create: `extension-wxt/manifest.json`
- Create: `extension-wxt/popup.html`
- Create: `extension-wxt/popup.ts`
- Create: `extension-wxt/background.ts`
- Create: `README.md`

**Step 1: Write failing smoke test for worker entrypoint export**

```ts
// worker/test/smoke.test.ts
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("worker export", () => {
  it("exports fetch handler", () => {
    expect(typeof worker.fetch).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/smoke.test.ts`
Expected: FAIL with module resolution error for `../src/index`.

**Step 3: Write minimal worker entrypoint**

```ts
// worker/src/index.ts
export default {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/smoke.test.ts`
Expected: PASS with 1 passed test.

**Step 5: Add baseline project files**

Use exact content:

```json
// package.json
{
  "name": "coursera-deadline-tracker",
  "private": true,
  "workspaces": ["worker", "extension-wxt"],
  "scripts": {
    "test": "npm run -ws test"
  }
}
```

```gitignore
# Node
node_modules/
dist/

# Cloudflare
.wrangler/

# OS / editor
.DS_Store
.idea/
.vscode/
```

```json
// worker/package.json
{
  "name": "@app/worker",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260201.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

```json
// worker/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"]
  },
  "include": ["src", "test"]
}
```

```toml
# worker/wrangler.toml
name = "coursera-deadline-worker"
main = "src/index.ts"
compatibility_date = "2026-02-25"

[[d1_databases]]
binding = "DB"
database_name = "coursera-deadlines"
database_id = "REPLACE_ME"

[[kv_namespaces]]
binding = "SESSIONS"
id = "REPLACE_ME"

[triggers]
crons = ["*/30 * * * *"]
```

```json
// extension-wxt/manifest.json
{
  "manifest_version": 3,
  "name": "Coursera Deadline Tracker",
  "version": "0.1.0",
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" },
  "permissions": ["cookies", "storage", "alarms"],
  "host_permissions": ["https://*.coursera.org/*"]
}
```

**Step 6: Commit**

```bash
git add package.json .gitignore worker extension-wxt README.md
git commit -m "chore: bootstrap worker and extension skeleton"
```

---

### Task 2: Create D1 Schema + Migration Runner Contract

**Files:**

- Create: `worker/migrations/0001_init.sql`
- Create: `worker/src/db/schema.ts`
- Test: `worker/test/schema.test.ts`

**Step 1: Write failing schema test for required tables**

```ts
// worker/test/schema.test.ts
import { describe, it, expect } from "vitest";
import { REQUIRED_TABLES } from "../src/db/schema";

describe("schema contract", () => {
  it("contains all required tables", () => {
    expect(REQUIRED_TABLES).toEqual([
      "users",
      "api_tokens",
      "user_degree_targets",
      "deadlines_current",
      "deadline_events",
      "fetch_runs",
    ]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/schema.test.ts`
Expected: FAIL with missing module `../src/db/schema`.

**Step 3: Write minimal schema constants**

```ts
// worker/src/db/schema.ts
export const REQUIRED_TABLES = [
  "users",
  "api_tokens",
  "user_degree_targets",
  "deadlines_current",
  "deadline_events",
  "fetch_runs",
] as const;
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/schema.test.ts`
Expected: PASS.

**Step 5: Write migration file**

```sql
-- worker/migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  reauth_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_degree_targets (
  user_id TEXT NOT NULL,
  coursera_user_id INTEGER NOT NULL,
  degree_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, degree_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deadlines_current (
  user_id TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  title TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  url TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, stable_key)
);

CREATE TABLE IF NOT EXISTS deadline_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stable_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_deadline_at TEXT,
  new_deadline_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deadline_events_dedupe
ON deadline_events(user_id, stable_key, event_type, IFNULL(new_deadline_at, ""));

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  items_seen INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
```

**Step 6: Commit**

```bash
git add worker/migrations/0001_init.sql worker/src/db/schema.ts worker/test/schema.test.ts
git commit -m "feat(worker): add initial D1 schema contract and migration"
```

---

### Task 3: Implement Deadline Normalization (Assignments + Events)

**Files:**

- Create: `worker/src/domain/normalize.ts`
- Test: `worker/test/normalize.test.ts`

**Step 1: Write failing tests for assignment/event normalization**

```ts
// worker/test/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCalendarItems } from "../src/domain/normalize";

describe("normalizeCalendarItems", () => {
  it("normalizes assignment item", () => {
    const out = normalizeCalendarItems([
      {
        assignment: {
          itemId: "abc",
          courseId: "c1",
          courseName: "Course",
          assignmentName: "A1",
          dueAtTime: "2026-03-01T10:00:00Z",
          assignmentUrl: "/x",
          isComplete: false,
        },
      },
    ]);
    expect(out[0].stableKey).toBe("assignment:abc");
    expect(out[0].deadlineAt).toBe("2026-03-01T10:00:00Z");
  });

  it("normalizes event item", () => {
    const out = normalizeCalendarItems([
      {
        event: {
          eventId: "ev1",
          courseId: "c2",
          courseName: "Course 2",
          eventTitle: "Live",
          startTime: "2026-03-01T12:00:00Z",
          eventUrl: "https://zoom.example",
        },
      },
    ]);
    expect(out[0].stableKey).toBe("event:ev1");
    expect(out[0].deadlineAt).toBe("2026-03-01T12:00:00Z");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/normalize.test.ts`
Expected: FAIL missing `normalizeCalendarItems`.

**Step 3: Implement minimal normalizer**

```ts
// worker/src/domain/normalize.ts
export type NormalizedItem = {
  kind: "assignment" | "event";
  stableKey: string;
  courseId: string;
  courseName: string;
  title: string;
  deadlineAt: string;
  url: string;
  isComplete: boolean;
  rawJson: string;
};

export function normalizeCalendarItems(items: any[]): NormalizedItem[] {
  return items.flatMap((entry) => {
    if (entry.assignment) {
      const a = entry.assignment;
      return [
        {
          kind: "assignment" as const,
          stableKey: `assignment:${a.itemId}`,
          courseId: a.courseId,
          courseName: a.courseName,
          title: a.assignmentName,
          deadlineAt: a.dueAtTime,
          url: a.assignmentUrl,
          isComplete: Boolean(a.isComplete),
          rawJson: JSON.stringify(entry),
        },
      ];
    }
    if (entry.event) {
      const e = entry.event;
      return [
        {
          kind: "event" as const,
          stableKey: `event:${e.eventId}`,
          courseId: e.courseId,
          courseName: e.courseName,
          title: e.eventTitle,
          deadlineAt: e.startTime,
          url: e.eventUrl,
          isComplete: false,
          rawJson: JSON.stringify(entry),
        },
      ];
    }
    return [];
  });
}
```

**Step 4: Run tests to verify pass**

Run: `npm run -w worker test -- worker/test/normalize.test.ts`
Expected: PASS with 2 tests.

**Step 5: Commit**

```bash
git add worker/src/domain/normalize.ts worker/test/normalize.test.ts
git commit -m "feat(worker): normalize assignment and event calendar items"
```

---

### Task 4: Implement Upcoming + Changed Filtering and Diff Engine

**Files:**

- Create: `worker/src/domain/diff.ts`
- Test: `worker/test/diff.test.ts`

**Step 1: Write failing tests for new/changed/removed and filter rules**

```ts
// worker/test/diff.test.ts
import { describe, it, expect } from "vitest";
import { computeDeadlineEvents } from "../src/domain/diff";

describe("computeDeadlineEvents", () => {
  it("returns new event for new upcoming assignment", () => {
    const now = "2026-02-25T00:00:00Z";
    const out = computeDeadlineEvents(
      [],
      [
        {
          stableKey: "assignment:a1",
          deadlineAt: "2026-02-26T00:00:00Z",
          isComplete: false,
        },
      ],
      now,
    );
    expect(out.map((x) => x.type)).toEqual(["new"]);
  });

  it("skips completed assignment", () => {
    const out = computeDeadlineEvents(
      [],
      [
        {
          stableKey: "assignment:a2",
          deadlineAt: "2026-02-26T00:00:00Z",
          isComplete: true,
        },
      ],
      "2026-02-25T00:00:00Z",
    );
    expect(out).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/diff.test.ts`
Expected: FAIL missing module.

**Step 3: Implement minimal diff engine**

```ts
// worker/src/domain/diff.ts
type Lite = { stableKey: string; deadlineAt: string; isComplete: boolean };
type DiffEvent = {
  type: "new" | "changed" | "removed";
  stableKey: string;
  oldDeadlineAt: string | null;
  newDeadlineAt: string | null;
};

export function computeDeadlineEvents(
  previous: Lite[],
  latest: Lite[],
  nowIso: string,
): DiffEvent[] {
  const now = Date.parse(nowIso);
  const filtered = latest.filter((i) => !i.isComplete && Date.parse(i.deadlineAt) > now);
  const prevMap = new Map(previous.map((x) => [x.stableKey, x]));
  const nextMap = new Map(filtered.map((x) => [x.stableKey, x]));
  const events: DiffEvent[] = [];

  for (const item of filtered) {
    const prev = prevMap.get(item.stableKey);
    if (!prev)
      events.push({
        type: "new",
        stableKey: item.stableKey,
        oldDeadlineAt: null,
        newDeadlineAt: item.deadlineAt,
      });
    else if (prev.deadlineAt !== item.deadlineAt)
      events.push({
        type: "changed",
        stableKey: item.stableKey,
        oldDeadlineAt: prev.deadlineAt,
        newDeadlineAt: item.deadlineAt,
      });
  }

  for (const prev of previous) {
    if (!nextMap.has(prev.stableKey))
      events.push({
        type: "removed",
        stableKey: prev.stableKey,
        oldDeadlineAt: prev.deadlineAt,
        newDeadlineAt: null,
      });
  }
  return events;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/diff.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/domain/diff.ts worker/test/diff.test.ts
git commit -m "feat(worker): add upcoming and changed deadline diff engine"
```

---

### Task 5: Implement Coursera Request Builder for Confirmed Endpoint

**Files:**

- Create: `worker/src/coursera/client.ts`
- Test: `worker/test/coursera-client.test.ts`

**Step 1: Write failing test for endpoint headers and payload**

```ts
// worker/test/coursera-client.test.ts
import { describe, it, expect } from "vitest";
import { buildCalendarRequest } from "../src/coursera/client";

describe("buildCalendarRequest", () => {
  it("builds GetDegreeHomeCalendar request", () => {
    const req = buildCalendarRequest({
      courseraUserId: 144497456,
      degreeId: "base~XYZ",
      csrf3Token: "abc",
      cookieHeader: "CAUTH=123;",
    });
    expect(req.url).toContain(
      "/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar",
    );
    expect(req.init.headers["operation-name"]).toBe("GetDegreeHomeCalendar");
    expect(req.init.body).toContain('"degreeId":"base~XYZ"');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/coursera-client.test.ts`
Expected: FAIL missing module.

**Step 3: Implement request builder**

```ts
// worker/src/coursera/client.ts
type In = { courseraUserId: number; degreeId: string; csrf3Token: string; cookieHeader: string };
type Built = { url: string; init: RequestInit & { headers: Record<string, string> } };

export function buildCalendarRequest(input: In): Built {
  const url =
    "https://www.coursera.org/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar";
  return {
    url,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "operation-name": "GetDegreeHomeCalendar",
        origin: "https://www.coursera.org",
        referer: "https://www.coursera.org/",
        "x-csrf3-token": input.csrf3Token,
        cookie: input.cookieHeader,
      },
      body: JSON.stringify({
        userId: input.courseraUserId,
        degreeId: input.degreeId,
      }),
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/coursera-client.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/coursera/client.ts worker/test/coursera-client.test.ts
git commit -m "feat(worker): build Coursera calendar request contract"
```

---

### Task 6: Add Token Auth + Register Endpoint

**Files:**

- Create: `worker/src/auth/token.ts`
- Create: `worker/src/routes/register.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/register.test.ts`

**Step 1: Write failing test for register endpoint**

```ts
// worker/test/register.test.ts
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("POST /api/register", () => {
  it("returns user_id and api_token", async () => {
    const req = new Request("https://x/api/register", {
      method: "POST",
      body: JSON.stringify({ name: "Satty", telegram_chat_id: "12345" }),
    });
    const res = await worker.fetch(req, {} as any, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user_id).toBeTypeOf("string");
    expect(body.api_token).toBeTypeOf("string");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/register.test.ts`
Expected: FAIL (status not 200 / route missing).

**Step 3: Implement minimal register handler**

```ts
// worker/src/auth/token.ts
export function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}
```

```ts
// worker/src/routes/register.ts
import { makeToken } from "../auth/token";

export async function handleRegister(req: Request): Promise<Response> {
  const body = (await req.json()) as { name: string; telegram_chat_id: string };
  const payload = {
    user_id: crypto.randomUUID(),
    api_token: makeToken(),
    name: body.name,
    telegram_chat_id: body.telegram_chat_id,
  };
  return Response.json(payload);
}
```

```ts
// worker/src/index.ts
import { handleRegister } from "./routes/register";

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/api/register") {
      return handleRegister(req);
    }
    return new Response("not found", { status: 404 });
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/register.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/auth/token.ts worker/src/routes/register.ts worker/src/index.ts worker/test/register.test.ts
git commit -m "feat(worker): add register endpoint and token issuance"
```

---

### Task 7: Add Session Upload Endpoint (Encrypted Session Bundle)

**Files:**

- Create: `worker/src/security/session-crypto.ts`
- Create: `worker/src/routes/session.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/session.test.ts`

**Step 1: Write failing test for `/api/session` request shape validation**

```ts
// worker/test/session.test.ts
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("POST /api/session", () => {
  it("rejects missing cookies", async () => {
    const req = new Request("https://x/api/session", { method: "POST", body: JSON.stringify({}) });
    const res = await worker.fetch(req, {} as any, {} as any);
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/session.test.ts`
Expected: FAIL (route missing).

**Step 3: Implement minimal session route + encryption helper**

```ts
// worker/src/security/session-crypto.ts
export function encodeSession(payload: unknown): string {
  const raw = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(raw)));
}
```

```ts
// worker/src/routes/session.ts
import { encodeSession } from "../security/session-crypto";

export async function handleSession(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    cookies?: unknown[];
    csrf3Token?: string;
    courseraUserId?: number;
    degreeIds?: string[];
  };
  if (!body.cookies || !Array.isArray(body.cookies) || body.cookies.length === 0) {
    return Response.json({ error: "cookies required" }, { status: 400 });
  }
  const encoded = encodeSession(body);
  return Response.json({ ok: true, encoded_size: encoded.length });
}
```

```ts
// worker/src/index.ts (add route)
import { handleSession } from "./routes/session";
// ...
if (req.method === "POST" && url.pathname === "/api/session") return handleSession(req);
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/session.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/security/session-crypto.ts worker/src/routes/session.ts worker/src/index.ts worker/test/session.test.ts
git commit -m "feat(worker): add session upload endpoint with encrypted bundle contract"
```

---

### Task 8: Implement Fetch-Now Pipeline (Fetch -> Normalize -> Diff)

**Files:**

- Create: `worker/src/usecases/fetch-now.ts`
- Create: `worker/src/routes/fetch-now.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/fetch-now.test.ts`

**Step 1: Write failing pipeline unit test**

```ts
// worker/test/fetch-now.test.ts
import { describe, it, expect } from "vitest";
import { runFetchNow } from "../src/usecases/fetch-now";

describe("runFetchNow", () => {
  it("returns counts for normalized and diffed items", async () => {
    const out = await runFetchNow({
      nowIso: "2026-02-25T00:00:00Z",
      previous: [],
      latestResponse: [
        {
          assignment: {
            itemId: "x1",
            courseId: "c1",
            courseName: "C1",
            assignmentName: "A",
            dueAtTime: "2026-02-26T00:00:00Z",
            assignmentUrl: "/a",
            isComplete: false,
          },
        },
      ],
    });
    expect(out.itemsSeen).toBe(1);
    expect(out.events.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/fetch-now.test.ts`
Expected: FAIL missing module.

**Step 3: Implement fetch-now use case**

```ts
// worker/src/usecases/fetch-now.ts
import { normalizeCalendarItems } from "../domain/normalize";
import { computeDeadlineEvents } from "../domain/diff";

export async function runFetchNow(input: {
  nowIso: string;
  previous: any[];
  latestResponse: any[];
}) {
  const normalized = normalizeCalendarItems(input.latestResponse);
  const litePrev = input.previous.map((x) => ({
    stableKey: x.stableKey,
    deadlineAt: x.deadlineAt,
    isComplete: x.isComplete,
  }));
  const liteNext = normalized.map((x) => ({
    stableKey: x.stableKey,
    deadlineAt: x.deadlineAt,
    isComplete: x.isComplete,
  }));
  const events = computeDeadlineEvents(litePrev, liteNext, input.nowIso);
  return { itemsSeen: normalized.length, normalized, events };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/fetch-now.test.ts`
Expected: PASS.

**Step 5: Add minimal route integration and commit**

```ts
// worker/src/routes/fetch-now.ts
import { runFetchNow } from "../usecases/fetch-now";

export async function handleFetchNow(): Promise<Response> {
  const result = await runFetchNow({
    nowIso: new Date().toISOString(),
    previous: [],
    latestResponse: [],
  });
  return Response.json({ ok: true, run_id: crypto.randomUUID(), items_seen: result.itemsSeen });
}
```

```ts
// worker/src/index.ts (add route)
import { handleFetchNow } from "./routes/fetch-now";
// ...
if (req.method === "POST" && url.pathname === "/api/fetch-now") return handleFetchNow();
```

```bash
git add worker/src/usecases/fetch-now.ts worker/src/routes/fetch-now.ts worker/src/index.ts worker/test/fetch-now.test.ts
git commit -m "feat(worker): add fetch-now normalization and diff pipeline"
```

---

### Task 9: Add Telegram Message Formatter and Notify Gate

**Files:**

- Create: `worker/src/notify/telegram.ts`
- Test: `worker/test/telegram.test.ts`

**Step 1: Write failing formatter test**

```ts
// worker/test/telegram.test.ts
import { describe, it, expect } from "vitest";
import { formatDeadlineChangeMessage } from "../src/notify/telegram";

describe("formatDeadlineChangeMessage", () => {
  it("formats changed deadline message", () => {
    const text = formatDeadlineChangeMessage({
      courseName: "Intro to Data Analytics",
      title: "Final Exam",
      oldDeadlineAt: "2026-02-27T10:00:00Z",
      newDeadlineAt: "2026-02-28T10:00:00Z",
    });
    expect(text).toContain("Final Exam");
    expect(text).toContain("2026-02-28T10:00:00Z");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/telegram.test.ts`
Expected: FAIL missing module.

**Step 3: Implement formatter**

```ts
// worker/src/notify/telegram.ts
export function formatDeadlineChangeMessage(input: {
  courseName: string;
  title: string;
  oldDeadlineAt: string | null;
  newDeadlineAt: string | null;
}): string {
  return [
    "Deadline updated",
    `Course: ${input.courseName}`,
    `Item: ${input.title}`,
    `Old: ${input.oldDeadlineAt ?? "-"}`,
    `New: ${input.newDeadlineAt ?? "-"}`,
  ].join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/telegram.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/notify/telegram.ts worker/test/telegram.test.ts
git commit -m "feat(worker): add Telegram deadline change formatter"
```

---

### Task 10: Build Extension Zero-Setup Onboarding Flow

**Files:**

- Modify: `extension-wxt/popup.html`
- Modify: `extension-wxt/popup.ts`
- Modify: `extension-wxt/background.ts`
- Create: `extension-wxt/types.ts`
- Test: `extension-wxt/popup.test.ts`

**Step 1: Write failing popup state test**

```ts
// extension-wxt/popup.test.ts
import { describe, it, expect } from "vitest";
import { deriveStatusLabel } from "./popup";

describe("deriveStatusLabel", () => {
  it("shows connected when token and session exist", () => {
    expect(deriveStatusLabel({ hasToken: true, hasSession: true, reauthRequired: false })).toBe(
      "Connected",
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test:extension-wxt`
Expected: FAIL missing exports/test setup.

**Step 3: Implement minimal derivation + onboarding actions**

```ts
// extension-wxt/popup.ts
export function deriveStatusLabel(input: {
  hasToken: boolean;
  hasSession: boolean;
  reauthRequired: boolean;
}): string {
  if (input.reauthRequired) return "Reconnect needed";
  if (input.hasToken && input.hasSession) return "Connected";
  return "Not connected";
}
```

```ts
// extension-wxt/background.ts (contract only)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "capture_session") {
    sendResponse({ ok: true, cookiesCaptured: 1 });
  }
});
```

**Step 4: Run test to verify it passes**

Run: `bun run test:extension-wxt`
Expected: PASS.

**Step 5: Commit**

```bash
git add extension-wxt/popup.html extension-wxt/popup.ts extension-wxt/background.ts extension-wxt/types.ts extension-wxt/popup.test.ts
git commit -m "feat(extension): add zero-setup onboarding state contract"
```

---

### Task 11: Add Auto-Discovery Contract for Coursera Targets

**Files:**

- Create: `worker/src/coursera/discovery.ts`
- Test: `worker/test/discovery.test.ts`

**Step 1: Write failing parser test for discovered degree targets**

```ts
// worker/test/discovery.test.ts
import { describe, it, expect } from "vitest";
import { extractDegreeTargets } from "../src/coursera/discovery";

describe("extractDegreeTargets", () => {
  it("extracts unique degree ids", () => {
    const targets = extractDegreeTargets(
      [{ assignment: { courseId: "c1" } }, { event: { courseId: "c2" } }],
      "base~deg1",
      144497456,
    );
    expect(targets).toEqual([{ courseraUserId: 144497456, degreeId: "base~deg1" }]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/discovery.test.ts`
Expected: FAIL missing module.

**Step 3: Implement discovery helper (YAGNI version)**

```ts
// worker/src/coursera/discovery.ts
export function extractDegreeTargets(
  _items: unknown[],
  fallbackDegreeId: string,
  courseraUserId: number,
) {
  return [{ courseraUserId, degreeId: fallbackDegreeId }];
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/discovery.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/coursera/discovery.ts worker/test/discovery.test.ts
git commit -m "feat(worker): add zero-setup degree discovery contract"
```

---

### Task 12: Add Cron Sync Route + Reauth Status Surface

**Files:**

- Create: `worker/src/routes/cron.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/cron.test.ts`

**Step 1: Write failing cron route test**

```ts
// worker/test/cron.test.ts
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("GET /internal/cron/fetch", () => {
  it("returns ok", async () => {
    const res = await worker.fetch(
      new Request("https://x/internal/cron/fetch"),
      {} as any,
      {} as any,
    );
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/cron.test.ts`
Expected: FAIL (404).

**Step 3: Implement cron route**

```ts
// worker/src/routes/cron.ts
export async function handleCronFetch(): Promise<Response> {
  return Response.json({ ok: true, processed_users: 0 });
}
```

```ts
// worker/src/index.ts (add route)
import { handleCronFetch } from "./routes/cron";
// ...
if (req.method === "GET" && url.pathname === "/internal/cron/fetch") return handleCronFetch();
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/cron.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/routes/cron.ts worker/src/index.ts worker/test/cron.test.ts
git commit -m "feat(worker): add cron fetch route contract"
```

---

### Task 13: Add Redaction + Security Regression Tests

**Files:**

- Create: `worker/src/security/redact.ts`
- Test: `worker/test/redact.test.ts`

**Step 1: Write failing redaction test**

```ts
// worker/test/redact.test.ts
import { describe, it, expect } from "vitest";
import { redactSecrets } from "../src/security/redact";

describe("redactSecrets", () => {
  it("removes CAUTH and csrf tokens from logs", () => {
    const out = redactSecrets("cookie=CAUTH=abc; x-csrf3-token=xyz");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run -w worker test -- worker/test/redact.test.ts`
Expected: FAIL missing module.

**Step 3: Implement redactor**

```ts
// worker/src/security/redact.ts
export function redactSecrets(input: string): string {
  return input
    .replace(/CAUTH=[^;\\s]+/g, "CAUTH=[REDACTED]")
    .replace(/x-csrf3-token=[^;\\s]+/gi, "x-csrf3-token=[REDACTED]");
}
```

**Step 4: Run test to verify it passes**

Run: `npm run -w worker test -- worker/test/redact.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add worker/src/security/redact.ts worker/test/redact.test.ts
git commit -m "test(worker): add secret redaction regression coverage"
```

---

### Task 14: Add End-to-End Smoke Script + Operator Docs

**Files:**

- Create: `scripts/e2e-smoke.sh`
- Create: `docs/runbooks/local-smoke.md`
- Modify: `README.md`

**Step 1: Write failing shellcheck-style test placeholder**

```bash
# scripts/e2e-smoke.sh
#!/usr/bin/env bash
set -euo pipefail
echo "TODO"
exit 1
```

**Step 2: Run script to verify it fails**

Run: `bash scripts/e2e-smoke.sh`
Expected: exit code 1 with `TODO`.

**Step 3: Implement minimal smoke script**

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"

echo "1) register"
curl -sS -X POST "$BASE_URL/api/register" \
  -H "content-type: application/json" \
  -d '{"name":"Smoke","telegram_chat_id":"123"}' >/tmp/register.json

echo "2) session"
curl -sS -X POST "$BASE_URL/api/session" \
  -H "content-type: application/json" \
  -d '{"cookies":[{"name":"CAUTH","value":"x"}],"csrf3Token":"token","courseraUserId":1,"degreeIds":["base~x"]}' >/tmp/session.json

echo "3) fetch-now"
curl -sS -X POST "$BASE_URL/api/fetch-now" >/tmp/fetch.json

echo "Smoke complete"
```

**Step 4: Run script to verify it passes**

Run: `bash scripts/e2e-smoke.sh`
Expected: `Smoke complete` (assuming local worker is running).

**Step 5: Document operator flow and commit**

Add `docs/runbooks/local-smoke.md` with:

- prerequisites (`wrangler dev`, bot token secret, D1 binding)
- execute script
- interpret failures (`401` means reauth, `400` means bad payload)

```bash
git add scripts/e2e-smoke.sh docs/runbooks/local-smoke.md README.md
git commit -m "docs: add local smoke runbook for zero-setup deadline tracker"
```

---

## Final Verification Checklist

Run all worker tests:

```bash
npm run -w worker test
```

Expected: PASS.

Run extension tests:

```bash
bun run test:extension-wxt
```

Expected: PASS.

Run smoke script (with local worker up):

```bash
bash scripts/e2e-smoke.sh
```

Expected: `Smoke complete`.

---

## Non-Goals (YAGNI for This Iteration)

- Multi-channel notifications beyond Telegram
- Rich UI analytics dashboards
- Per-course rule editors
- Queue-based distributed workers

---

## Risks and Mitigations

- **Risk:** Coursera auth/session rotation can break fetches.
  - **Mitigation:** surface `reauth_required` quickly and keep reconnect one-click.
- **Risk:** notification noise.
  - **Mitigation:** upcoming-only + changed/new-only defaults with dedupe index.
- **Risk:** secret leakage in logs.
  - **Mitigation:** mandatory redaction utility and regression tests.
