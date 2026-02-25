import { describe, expect, it } from "bun:test";
import worker from "../src/index";

describe("GET /api/status", () => {
  it("returns status payload", async () => {
    const res = await worker.fetch(new Request("https://x/api/status"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect("tracked_items" in body).toBe(true);
  });
});
