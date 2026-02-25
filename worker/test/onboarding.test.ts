import { describe, expect, it } from "bun:test";
import worker from "../src/index";

describe("onboarding routes", () => {
  it("returns 500 for onboarding start without DB binding", async () => {
    const req = new Request("https://x/api/onboarding/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Satty" }),
    });
    const res = await worker.fetch(req);
    expect(res.status).toBe(500);
  });

  it("returns 500 for onboarding status without DB binding", async () => {
    const req = new Request("https://x/api/onboarding/status?poll_token=abc", {
      method: "GET",
    });
    const res = await worker.fetch(req);
    expect(res.status).toBe(500);
  });
});
