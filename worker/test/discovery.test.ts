import { describe, it, expect } from "bun:test";
import { extractDegreeTargets } from "../src/coursera/discovery";

describe("extractDegreeTargets", () => {
  it("extracts unique degree ids", () => {
    const targets = extractDegreeTargets(
      [{ assignment: { courseId: "c1" } }, { event: { courseId: "c2" } }],
      "base~deg1",
      144497456,
    );

    expect(targets).toEqual([{ courseraUserId: 144497456, degreeId: "base~deg1" }]);
  });
});
