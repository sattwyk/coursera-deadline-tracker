import { describe, it, expect } from "bun:test";
import { computeDeadlineEvents } from "../src/domain/diff";

describe("computeDeadlineEvents", () => {
  it("returns new event for new upcoming assignment", () => {
    const out = computeDeadlineEvents(
      [],
      [{ stableKey: "assignment:a1", deadlineAt: "2026-02-26T00:00:00Z", isComplete: false }],
      "2026-02-25T00:00:00Z",
    );

    expect(out.map((x) => x.type)).toEqual(["new"]);
  });

  it("skips completed assignment", () => {
    const out = computeDeadlineEvents(
      [],
      [{ stableKey: "assignment:a2", deadlineAt: "2026-02-26T00:00:00Z", isComplete: true }],
      "2026-02-25T00:00:00Z",
    );

    expect(out).toHaveLength(0);
  });
});
