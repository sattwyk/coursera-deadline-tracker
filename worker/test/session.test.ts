import { describe, it, expect } from "bun:test";
import worker from "../src/index";

describe("POST /api/session", () => {
  it("rejects missing cookies", async () => {
    const req = new Request("https://x/api/session", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await worker.fetch(req);
    expect(res.status).toBe(400);
  });
});
