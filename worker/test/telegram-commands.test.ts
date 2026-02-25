import { describe, expect, it } from "bun:test";
import { buildHelpText, isValidTimezone, parseTelegramCommand } from "../src/telegram/commands";

describe("telegram commands", () => {
  it("parses start payload", () => {
    expect(parseTelegramCommand("/start ABC123")).toEqual({ kind: "start", payload: "ABC123" });
  });

  it("parses mode command variants", () => {
    expect(parseTelegramCommand("/mode all")).toEqual({ kind: "mode", mode: "all" });
    expect(parseTelegramCommand("/mode none")).toEqual({ kind: "mode", mode: "none" });
    expect(parseTelegramCommand("/mode bad")).toEqual({ kind: "mode" });
  });

  it("supports bot-suffixed commands", () => {
    expect(parseTelegramCommand("/status@coursera_deadline_tracker_bot")).toEqual({
      kind: "status",
    });
  });

  it("validates timezone values", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Invalid/Zone")).toBe(false);
  });

  it("builds help text", () => {
    const help = buildHelpText();
    expect(help).toContain("<code>/status</code>");
    expect(help).toContain("<code>/sync</code>");
  });
});
