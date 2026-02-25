import { describe, it, expect } from "bun:test";
import worker from "../src/index";

describe("GET /internal/cron/fetch", () => {
  it("returns ok", async () => {
    const res = await worker.fetch(new Request("https://x/internal/cron/fetch"));
    expect(res.status).toBe(200);
  });
});
