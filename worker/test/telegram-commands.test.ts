import { describe, expect, it } from "bun:test";
import {
  buildHelpText,
  isValidTimezone,
  parseTelegramCommand,
  resolveLocale,
} from "../src/telegram/commands";

describe("telegram commands", () => {
  it("parses start payload", () => {
    expect(parseTelegramCommand("/start ABC123")).toEqual({ kind: "start", payload: "ABC123" });
  });

  it("parses mode command variants", () => {
    expect(parseTelegramCommand("/mode all")).toEqual({ kind: "mode", mode: "all" });
    expect(parseTelegramCommand("/mode none")).toEqual({ kind: "mode", mode: "none" });
    expect(parseTelegramCommand("/mode bad")).toEqual({ kind: "mode" });
  });

  it("parses list command variants", () => {
    expect(parseTelegramCommand("/list pending")).toEqual({ kind: "list", filter: "pending" });
    expect(parseTelegramCommand("/list completed")).toEqual({ kind: "list", filter: "completed" });
    expect(parseTelegramCommand("/list everything")).toEqual({ kind: "list", filter: "all" });
    expect(parseTelegramCommand("/list")).toEqual({ kind: "list", filter: "upcoming" });
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
    expect(help).toContain("<code>/list");
    expect(help).toContain("<code>/sync</code>");
  });

  it("resolves locale with fallback", () => {
    expect(resolveLocale("hi-IN")).toBe("hi");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("fr-FR")).toBe("en");
  });
});
