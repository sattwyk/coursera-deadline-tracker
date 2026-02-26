import { z } from "zod";

const tgIdSchema = z.union([z.string(), z.number().int()]);

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    telegram_chat_id: z.string().trim().min(1).max(64),
  })
  .strip();

export const sessionCookieSchema = z
  .object({
    name: z.string().min(1),
    value: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.string().optional(),
  })
  .strip();

export const sessionBodySchema = z
  .object({
    cookies: z.array(sessionCookieSchema).min(1),
    csrf3Token: z.string().min(1),
    courseraUserId: z.number().int().positive(),
    degreeIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strip();

export const onboardingStartBodySchema = z
  .object({
    name: z
      .union([z.string(), z.undefined()])
      .transform((value) => (typeof value === "string" ? value.trim() : value))
      .refine((value) => value === undefined || value.length <= 120, {
        message: "name must be at most 120 characters",
      })
      .optional(),
  })
  .strip();

export const onboardingCancelBodySchema = z
  .object({
    poll_token: z.string().trim().min(1).max(128),
  })
  .strip();

export const onboardingStatusQuerySchema = z
  .object({
    poll_token: z.string().trim().min(1).max(128),
  })
  .strip();

export const deadlinesQuerySchema = z
  .object({
    filter: z.enum(["pending", "completed", "upcoming", "overdue", "all", "everything"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strip();

export const telegramUserSchema = z
  .object({
    id: tgIdSchema,
    language_code: z.string().optional(),
  })
  .passthrough();

export const telegramMessageSchema = z
  .object({
    message_id: z.number().int().optional(),
    text: z.string().optional(),
    chat: z
      .object({
        id: tgIdSchema,
      })
      .passthrough()
      .optional(),
    from: telegramUserSchema.optional(),
  })
  .passthrough();

export const telegramCallbackQuerySchema = z
  .object({
    id: z.string(),
    from: telegramUserSchema,
    data: z.string().optional(),
    message: telegramMessageSchema.optional(),
  })
  .passthrough();

export const telegramInlineQuerySchema = z
  .object({
    id: z.string(),
    from: telegramUserSchema,
    query: z.string().optional(),
    offset: z.string().optional(),
  })
  .passthrough();

export const telegramUpdateSchema = z
  .object({
    message: telegramMessageSchema.optional(),
    edited_message: telegramMessageSchema.optional(),
    callback_query: telegramCallbackQuerySchema.optional(),
    inline_query: telegramInlineQuerySchema.optional(),
  })
  .passthrough();

export const telegramGetMeSchema = z
  .object({
    result: z
      .object({
        username: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type SessionBody = z.infer<typeof sessionBodySchema>;
export type OnboardingStartBody = z.infer<typeof onboardingStartBodySchema>;
export type OnboardingCancelBody = z.infer<typeof onboardingCancelBodySchema>;
export type OnboardingStatusQuery = z.infer<typeof onboardingStatusQuerySchema>;
export type DeadlinesQuery = z.infer<typeof deadlinesQuerySchema>;
export type TelegramUser = z.infer<typeof telegramUserSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>;
export type TelegramInlineQuery = z.infer<typeof telegramInlineQuerySchema>;
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
