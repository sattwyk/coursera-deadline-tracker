import { Result } from "better-result";

export type ParsedCommand =
  | { kind: "start"; payload?: string }
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "settings" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "mode"; mode?: "all" | "new" | "changed" | "none" }
  | { kind: "timezone"; timezone?: string }
  | { kind: "sync" }
  | { kind: "test" }
  | { kind: "unknown"; raw: string };

function readBaseCommand(token: string): string {
  const withoutSlash = token.startsWith("/") ? token.slice(1) : token;
  return withoutSlash.split("@")[0]?.toLowerCase() ?? "";
}

export function parseTelegramCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const cmd = readBaseCommand(parts[0] ?? "");
  const arg = parts[1]?.trim();

  if (cmd === "start") return { kind: "start", payload: arg };
  if (cmd === "help") return { kind: "help" };
  if (cmd === "status") return { kind: "status" };
  if (cmd === "settings") return { kind: "settings" };
  if (cmd === "pause") return { kind: "pause" };
  if (cmd === "resume") return { kind: "resume" };
  if (cmd === "sync") return { kind: "sync" };
  if (cmd === "test") return { kind: "test" };

  if (cmd === "mode") {
    const normalized = arg?.toLowerCase();
    if (
      normalized === "all" ||
      normalized === "new" ||
      normalized === "changed" ||
      normalized === "none"
    ) {
      return { kind: "mode", mode: normalized };
    }
    return { kind: "mode" };
  }

  if (cmd === "timezone" || cmd === "tz") {
    return { kind: "timezone", timezone: arg };
  }

  return { kind: "unknown", raw: cmd };
}

export function isValidTimezone(timezone: string): boolean {
  const fmtResult = Result.try(() => new Intl.DateTimeFormat("en-US", { timeZone: timezone }));
  if (Result.isError(fmtResult)) return false;
  fmtResult.value.format(new Date());
  return true;
}

export function buildHelpText(): string {
  return [
    "<b>Coursera Deadline Tracker</b>",
    "",
    "<b>Commands</b>",
    "<code>/status</code> - Show sync status and settings",
    "<code>/settings</code> - Show current notification settings",
    "<code>/pause</code> - Pause Telegram notifications",
    "<code>/resume</code> - Resume Telegram notifications",
    "<code>/mode &lt;all|new|changed|none&gt;</code> - Filter updates",
    "<code>/tz &lt;IANA timezone&gt;</code> - Set display timezone",
    "<code>/sync</code> - Run immediate sync now",
    "<code>/test</code> - Send a test message",
    "<code>/help</code> - Show this help",
  ].join("\n");
}
