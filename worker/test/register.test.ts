import { describe, it, expect } from "bun:test";
import worker from "../src/index";

describe("POST /api/register", () => {
  it("returns user_id and api_token", async () => {
    const req = new Request("https://x/api/register", {
      method: "POST",
      body: JSON.stringify({ name: "Satty", telegram_chat_id: "12345" }),
    });

    const res = await worker.fetch(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.user_id).toBe("string");
    expect(typeof body.api_token).toBe("string");
  });
});
