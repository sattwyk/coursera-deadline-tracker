import { describe, expect, it } from "bun:test";
import { hashToken } from "../src/auth/token";

describe("hashToken", () => {
  it("returns deterministic sha256 hash", async () => {
    const one = await hashToken("abc");
    const two = await hashToken("abc");
    expect(one).toBe(two);
    expect(one.length).toBe(64);
  });
});
