import { describe, expect, it } from "bun:test";
import { decodeSession, encodeSession } from "../src/security/session-crypto";

describe("session crypto", () => {
  it("encodes and decodes payload", async () => {
    const payload = {
      cookies: [{ name: "CAUTH", value: "x" }],
      csrf3Token: "token",
      courseraUserId: 1,
      degreeIds: ["base~id"],
      capturedAt: "2026-02-25T00:00:00Z",
    };

    const encoded = await encodeSession(payload, "secret-key");
    const decoded = await decodeSession<typeof payload>(encoded, "secret-key");
    expect(decoded.degreeIds[0]).toBe("base~id");
    expect(decoded.csrf3Token).toBe("token");
  });
});
