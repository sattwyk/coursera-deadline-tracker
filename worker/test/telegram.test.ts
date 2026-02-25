import { describe, it, expect } from "bun:test";
import { Result } from "better-result";
import { formatDeadlineChangeMessage, sendTelegramMessage } from "../src/notify/telegram";

describe("formatDeadlineChangeMessage", () => {
  it("formats changed deadline message", () => {
    const text = formatDeadlineChangeMessage({
      eventType: "changed",
      courseName: "Intro to Data Analytics",
      title: "Final Exam",
      oldDeadlineAt: "2026-02-27T10:00:00Z",
      newDeadlineAt: "2026-02-28T10:00:00Z",
    });

    expect(text).toContain("Final Exam");
    expect(text).toContain("2026-02-28T10:00:00Z");
  });
});

describe("sendTelegramMessage", () => {
  it("returns ok result for successful send", async () => {
    const result = await sendTelegramMessage({
      botToken: "token",
      chatId: "1",
      text: "hello",
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });

    expect(Result.isOk(result)).toBe(true);
  });

  it("returns tagged error result for non-2xx response", async () => {
    const result = await sendTelegramMessage({
      botToken: "token",
      chatId: "1",
      text: "hello",
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });

    expect(Result.isError(result)).toBe(true);
    if (Result.isError(result)) {
      expect(result.error._tag).toBe("TelegramSendError");
    }
  });
});
