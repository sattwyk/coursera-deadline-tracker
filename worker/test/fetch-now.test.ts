import { describe, it, expect } from "bun:test";
import { runFetchNow } from "../src/usecases/fetch-now";

describe("runFetchNow", () => {
  it("returns counts for normalized and diffed items", async () => {
    const out = await runFetchNow({
      nowIso: "2026-02-25T00:00:00Z",
      previous: [],
      latestResponse: [
        {
          assignment: {
            itemId: "x1",
            courseId: "c1",
            courseName: "C1",
            assignmentName: "A",
            dueAtTime: "2026-02-26T00:00:00Z",
            assignmentUrl: "/a",
            isComplete: false,
          },
        },
      ],
    });

    expect(out.itemsSeen).toBe(1);
    expect(out.events.length).toBe(1);
  });
});
