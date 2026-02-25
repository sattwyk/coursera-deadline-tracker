import { describe, it, expect } from "bun:test";
import { REQUIRED_TABLES } from "../src/db/schema";

describe("schema contract", () => {
  it("contains all required tables", () => {
    expect(REQUIRED_TABLES).toEqual([
      "users",
      "api_tokens",
      "user_degree_targets",
      "deadlines_current",
      "deadline_events",
      "fetch_runs",
      "user_settings",
    ]);
  });
});
