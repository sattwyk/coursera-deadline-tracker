import { describe, expect, it } from "bun:test";
import { deriveStatusLabel } from "./lib/core/popup";

describe("deriveStatusLabel", () => {
  it("shows connected when token and session exist", () => {
    expect(deriveStatusLabel({ hasToken: true, hasSession: true, reauthRequired: false })).toBe(
      "Connected",
    );
  });

  it("shows reconnect needed when reauth is required", () => {
    expect(deriveStatusLabel({ hasToken: true, hasSession: false, reauthRequired: true })).toBe(
      "Reconnect needed",
    );
  });
});
