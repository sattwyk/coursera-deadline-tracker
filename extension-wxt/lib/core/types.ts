export type PopupState = {
  hasToken: boolean;
  hasSession: boolean;
  reauthRequired: boolean;
};

export type State = {
  baseUrl?: string;
  apiToken?: string;
  userId?: string;
  name?: string;
  telegramChatId?: string;
  courseraUserId?: number;
  degreeIds?: string[];
  autoCourseraUserId?: number;
  autoDegreeIds?: string[];
  autoDetectedAt?: string;
  lastStatus?: unknown;
  lastStatusAt?: string;
  hasSession?: boolean;
  reauthRequired?: boolean;
  onboardingPollToken?: string;
  onboardingLinkUrl?: string;
  onboardingExpiresAt?: string;
};

export type AutoDetection = {
  courseraUserId?: number | null;
  degreeIds?: string[];
  detectedAt?: string | null;
};

export type RegisterResponse = {
  api_token: string;
  user_id: string;
};

export type BannerKind = "neutral" | "ok" | "error";
