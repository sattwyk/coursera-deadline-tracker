import * as z from "zod/mini";

export const stateSchema = z.object({
  baseUrl: z.optional(z.string()),
  apiToken: z.optional(z.string()),
  userId: z.optional(z.string()),
  name: z.optional(z.string()),
  telegramChatId: z.optional(z.string()),
  courseraUserId: z.optional(z.number().check(z.positive())),
  degreeIds: z.optional(z.array(z.string())),
  autoCourseraUserId: z.optional(z.number().check(z.positive())),
  autoDegreeIds: z.optional(z.array(z.string())),
  autoDetectedAt: z.optional(z.string()),
  lastStatus: z.optional(z.unknown()),
  lastStatusAt: z.optional(z.string()),
  hasSession: z.optional(z.boolean()),
  reauthRequired: z.optional(z.boolean()),
  onboardingPollToken: z.optional(z.string()),
  onboardingLinkUrl: z.optional(z.string()),
  onboardingExpiresAt: z.optional(z.string()),
});

export const autoDetectionSchema = z.object({
  courseraUserId: z.optional(z.nullable(z.number().check(z.positive()))),
  degreeIds: z.optional(z.array(z.string())),
  detectedAt: z.optional(z.nullable(z.string())),
});

export const registerResponseSchema = z.looseObject({
  api_token: z.string().check(z.minLength(1)),
  user_id: z.string().check(z.minLength(1)),
});

export const statusResponseSchema = z.looseObject({
  reauth_required: z.optional(z.boolean()),
});

export const fetchNowResponseSchema = z.looseObject({
  run_id: z.optional(z.string()),
  items_seen: z.optional(z.union([z.number(), z.string()])),
  events_created: z.optional(z.union([z.number(), z.string()])),
});

export const onboardingStartValueSchema = z.looseObject({
  telegram_deeplink_url: z.string().check(z.minLength(1)),
  poll_token: z.string().check(z.minLength(1)),
  expires_at: z.optional(z.string()),
});

export const onboardingPollValueSchema = z.looseObject({
  status: z.enum(["pending", "linked", "expired", "cancelled"]),
  api_token: z.optional(z.string()),
  user_id: z.optional(z.string()),
  telegram_chat_id: z.optional(z.string()),
  name: z.optional(z.string()),
});

const sessionAutoConnectSuccessSchema = z.looseObject({
  ok: z.literal(true),
  cookiesCaptured: z.number().check(z.nonnegative()),
  encodedSize: z.unknown(),
  courseraUserId: z.number().check(z.positive()),
  degreeIds: z.array(z.string()),
});

const sessionAutoConnectFailureSchema = z.looseObject({
  ok: z.literal(false),
  error: z.string().check(z.minLength(1)),
  retrying: z.optional(z.boolean()),
});

export const sessionAutoConnectResponseSchema = z.union([
  sessionAutoConnectSuccessSchema,
  sessionAutoConnectFailureSchema,
]);

export const backgroundEnvelopeSchema = z.object({
  ok: z.boolean(),
  value: z.optional(z.unknown()),
  error: z.optional(z.unknown()),
});

export const uploadPayloadSchema = z.object({
  baseUrl: z.string().check(z.trim(), z.minLength(1)),
  apiToken: z.string().check(z.trim(), z.minLength(1)),
  courseraUserId: z.optional(z.coerce.number().check(z.positive())),
  degreeIds: z.optional(z.array(z.string().check(z.trim(), z.minLength(1)))),
});

export const onboardingStartPayloadSchema = z.object({
  baseUrl: z.string().check(z.trim(), z.minLength(1)),
  name: z.optional(z.string()),
});

export const onboardingPollPayloadSchema = z.object({
  baseUrl: z.string().check(z.trim(), z.minLength(1)),
  pollToken: z.string().check(z.trim(), z.minLength(1)),
});

export const onboardingCancelPayloadSchema = z.object({
  baseUrl: z.string().check(z.trim(), z.minLength(1)),
  pollToken: z.string().check(z.trim(), z.minLength(1)),
});

export const detectionPayloadSchema = z.object({
  userId: z.coerce.number().check(z.int(), z.positive()),
  degreeId: z.string().check(z.trim(), z.minLength(1)),
});
