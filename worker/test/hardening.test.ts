import { describe, expect, it } from "bun:test";
import worker from "../src/index";

describe("binding hardening", () => {
  it("fails closed when DB binding is missing on authenticated routes", async () => {
    const res = await worker.fetch(new Request("https://x/api/status"), {} as any);
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Missing required bindings: DB");
  });

  it("fails closed when session secret is missing on /api/session", async () => {
    const res = await worker.fetch(
      new Request("https://x/api/session", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      {
        SESSIONS: {
          get: async () => null,
          put: async () => undefined,
        },
      } as any,
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Missing required bindings: SESSION_SECRET");
  });
});
