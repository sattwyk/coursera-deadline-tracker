import { describe, it, expect } from "bun:test";
import { deriveStatusLabel } from "./popup";

describe("deriveStatusLabel", () => {
  it("shows connected when token and session exist", () => {
    expect(deriveStatusLabel({ hasToken: true, hasSession: true, reauthRequired: false })).toBe(
      "Connected",
    );
  });
});
