import { describe, it, expect } from "bun:test";
import { normalizeCalendarItems } from "../src/domain/normalize";

describe("normalizeCalendarItems", () => {
  it("normalizes assignment item", () => {
    const out = normalizeCalendarItems([
      {
        assignment: {
          itemId: "abc",
          courseId: "c1",
          courseName: "Course",
          assignmentName: "A1",
          dueAtTime: "2026-03-01T10:00:00Z",
          assignmentUrl: "/x",
          isComplete: false,
        },
      },
    ]);

    expect(out[0].stableKey).toBe("assignment:abc");
    expect(out[0].deadlineAt).toBe("2026-03-01T10:00:00Z");
  });

  it("normalizes event item", () => {
    const out = normalizeCalendarItems([
      {
        event: {
          eventId: "ev1",
          courseId: "c2",
          courseName: "Course 2",
          eventTitle: "Live",
          startTime: "2026-03-01T12:00:00Z",
          eventUrl: "https://zoom.example",
        },
      },
    ]);

    expect(out[0].stableKey).toBe("event:ev1");
    expect(out[0].deadlineAt).toBe("2026-03-01T12:00:00Z");
  });
});
