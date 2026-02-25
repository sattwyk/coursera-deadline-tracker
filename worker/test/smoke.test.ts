import { describe, it, expect } from "bun:test";
import worker from "../src/index";

describe("worker export", () => {
  it("exports fetch handler", () => {
    expect(typeof worker.fetch).toBe("function");
  });
});
