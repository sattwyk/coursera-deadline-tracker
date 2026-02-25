import { describe, expect, it } from "bun:test";
import worker from "../src/index";

describe("POST /api/telegram/webhook", () => {
  it("returns ok when bindings are missing in test env", async () => {
    const req = new Request("https://x/api/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        update_id: 1,
        message: {
          chat: { id: 123 },
          text: "/help",
        },
      }),
    });
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });
});
