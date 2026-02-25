import { describe, it, expect } from "bun:test";
import { buildCalendarRequest, buildCookieHeader } from "../src/coursera/client";

describe("buildCalendarRequest", () => {
  it("builds GetDegreeHomeCalendar request", () => {
    const req = buildCalendarRequest({
      courseraUserId: 144497456,
      degreeId: "base~XYZ",
      csrf3Token: "abc",
      cookieHeader: "CAUTH=123;",
    });

    expect(req.url).toContain(
      "/api/grpc/degreehome/v1beta1/DegreeHomeCalendarAPI/GetDegreeHomeCalendar",
    );
    expect(req.init.headers["operation-name"]).toBe("GetDegreeHomeCalendar");
    expect(typeof req.init.body).toBe("string");
    if (typeof req.init.body !== "string") {
      throw new Error("Expected request body to be string");
    }
    expect(req.init.body).toContain('"degreeId":"base~XYZ"');
  });

  it("builds cookie header from cookie array", () => {
    const header = buildCookieHeader([
      { name: "CAUTH", value: "abc" },
      { name: "CSRF3-Token", value: "def" },
    ]);
    expect(header).toBe("CAUTH=abc; CSRF3-Token=def");
  });
});
