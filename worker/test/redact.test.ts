import { describe, it, expect } from "bun:test";
import { redactSecrets } from "../src/security/redact";

describe("redactSecrets", () => {
  it("removes CAUTH and csrf tokens from logs", () => {
    const out = redactSecrets("cookie=CAUTH=abc; x-csrf3-token=xyz");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
  });
});
