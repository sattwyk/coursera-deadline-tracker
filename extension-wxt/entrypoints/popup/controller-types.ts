import type { AutoDetection, BannerKind, State } from "@/lib/core/types";

export type PopupFormState = {
  displayName: string;
  devBaseUrl: string;
  devTelegramChatId: string;
  devUserId: string;
  devDegreeIds: string;
};

export type PopupUiState = {
  storedState: State;
  auto: AutoDetection;
  form: PopupFormState;
  banner: {
    text: string;
    kind: BannerKind;
  };
};

export type PopupDerivedState = {
  hasToken: boolean;
  hasSession: boolean;
  isReauthRequired: boolean;
  onboardingHint: string;
  primaryButtonText: string;
  autoDetectHint: string;
  tokenHint: string;
  statusText: string;
  statusSummary: string;
  hasStatus: boolean;
  canOpenTelegramLink: boolean;
};

export type PopupBusyState = {
  onboarding: boolean;
  sessionConnect: boolean;
  fetchNow: boolean;
  refreshStatus: boolean;
  devRegister: boolean;
  cancelOnboarding: boolean;
};
