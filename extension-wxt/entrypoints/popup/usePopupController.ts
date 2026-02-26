import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Result } from "better-result";
import {
  asNumber,
  asString,
  asStringArray,
  getAutoDetection,
  getConfiguredBaseUrl,
  getDefaultBaseUrl,
  getManualOverrides,
  getState,
  isDevKnobsEnabled,
  openCourseraDegrees,
  openTelegramLink,
  requestDevRegister,
  requestFetchNow,
  requestOnboardingCancel,
  requestOnboardingPoll,
  requestOnboardingStart,
  requestSessionAutoConnect,
  requestStatus,
  setState,
} from "@/lib/core/popup";
import type { BannerKind, RegisterResponse } from "@/lib/core/types";
import { initialPopupUiState, popupReducer } from "./controller-reducer";
import type { PopupBusyState, PopupDerivedState, PopupUiState } from "./controller-types";

const IS_DEV_KNOBS = isDevKnobsEnabled();
const INITIAL_BUSY_STATE: PopupBusyState = {
  onboarding: false,
  sessionConnect: false,
  fetchNow: false,
  refreshStatus: false,
  devRegister: false,
  cancelOnboarding: false,
};

type ControllerActions = {
  setField: (field: keyof PopupUiState["form"], value: string) => void;
  onPrimaryAction: () => Promise<void>;
  onFetchNow: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
  onOpenCoursera: () => Promise<void>;
  onOpenTelegram: () => Promise<void>;
  onDevRegister: () => Promise<void>;
  onDevConnect: () => Promise<void>;
  onCancelOnboarding: () => Promise<void>;
};

function deriveState(state: PopupUiState): PopupDerivedState {
  const hasToken = Boolean(state.storedState.apiToken);
  const hasSession = Boolean(state.storedState.hasSession);
  const isReauthRequired = Boolean(state.storedState.reauthRequired);

  const detectedUserId = Number(
    state.auto.courseraUserId || state.storedState.autoCourseraUserId || 0,
  );
  const detectedDegreeIds = Array.isArray(state.auto.degreeIds)
    ? state.auto.degreeIds
    : Array.isArray(state.storedState.autoDegreeIds)
      ? state.storedState.autoDegreeIds
      : [];

  const onboardingHint = (() => {
    if (!hasToken) {
      if (state.storedState.onboardingPollToken) {
        return state.storedState.onboardingExpiresAt
          ? `Waiting for Telegram confirmation (expires ${state.storedState.onboardingExpiresAt})`
          : "Waiting for Telegram confirmation";
      }
      return "Connect Telegram to begin one-click setup.";
    }

    if (!hasSession || isReauthRequired) {
      return "Telegram linked. Open Coursera degree page once; session will connect automatically.";
    }

    return "Connected. Run a sync to check latest deadlines.";
  })();

  const primaryButtonText = (() => {
    if (!hasToken) {
      return state.storedState.onboardingPollToken ? "Continue Telegram Link" : "Connect Telegram";
    }

    if (!hasSession || isReauthRequired) {
      return isReauthRequired ? "Reconnect Coursera" : "Connect Coursera Session";
    }

    return "Sync Now";
  })();

  const autoDetectHint =
    detectedUserId > 0 || detectedDegreeIds.length > 0
      ? `Auto-detected: userId=${detectedUserId || "?"}, degreeIds=${
          detectedDegreeIds.join(", ") || "none"
        }${state.auto.detectedAt ? ` (${state.auto.detectedAt})` : ""}`
      : "No auto-detected IDs yet. Open Coursera degree page and refresh.";

  const tokenPreview = state.storedState.apiToken
    ? `${state.storedState.apiToken.slice(0, 10)}...`
    : "Not linked";
  const tokenHint = state.storedState.apiToken
    ? `user_id=${state.storedState.userId || "?"} token=${tokenPreview}`
    : "Not registered";

  const hasStatus = Boolean(state.storedState.lastStatus);
  const statusText = state.storedState.lastStatus
    ? `${state.storedState.lastStatusAt || ""}\n${JSON.stringify(state.storedState.lastStatus, null, 2)}`
    : "No status yet.";
  const statusSummary = state.storedState.lastStatusAt
    ? `Last updated: ${state.storedState.lastStatusAt}`
    : "No sync status yet.";

  return {
    hasToken,
    hasSession,
    isReauthRequired,
    onboardingHint,
    primaryButtonText,
    autoDetectHint,
    tokenHint,
    statusText,
    statusSummary,
    hasStatus,
    canOpenTelegramLink: Boolean(state.storedState.onboardingLinkUrl),
  };
}

export function usePopupController(): {
  state: PopupUiState;
  derived: PopupDerivedState;
  busy: PopupBusyState;
  isDevKnobs: boolean;
  actions: ControllerActions;
} {
  const [state, dispatch] = useReducer(popupReducer, initialPopupUiState);
  const [busy, setBusy] = useState<PopupBusyState>(INITIAL_BUSY_STATE);
  const pollInFlight = useRef(false);

  const runWithBusy = useCallback(
    async <T>(key: keyof PopupBusyState, operation: () => Promise<T>): Promise<T> => {
      setBusy((current) => ({ ...current, [key]: true }));
      try {
        return await operation();
      } finally {
        setBusy((current) => ({ ...current, [key]: false }));
      }
    },
    [],
  );

  const setBanner = useCallback((text: string, kind: BannerKind): void => {
    dispatch({ type: "set-banner", payload: { text, kind } });
  }, []);

  const setField = useCallback((field: keyof PopupUiState["form"], value: string): void => {
    dispatch({ type: "set-field", payload: { field, value } });
  }, []);

  const refreshUi = useCallback(async (): Promise<void> => {
    const [storedState, auto] = await Promise.all([getState(), getAutoDetection()]);
    dispatch({
      type: "sync",
      payload: {
        storedState,
        auto,
        isDevKnobsEnabled: IS_DEV_KNOBS,
        defaultBaseUrl: getDefaultBaseUrl(),
      },
    });
  }, []);

  const connectCourseraSession = useCallback(
    async (fromAuto = false): Promise<void> => {
      await runWithBusy("sessionConnect", async () => {
        const liveState = await getState();
        const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);

        if (!liveState.apiToken) {
          setBanner("Connect Telegram first", "error");
          return;
        }

        const overrides = getManualOverrides(state.form.devUserId, state.form.devDegreeIds);

        setBanner(
          fromAuto ? "Connecting Coursera session..." : "Capturing Coursera session...",
          "neutral",
        );

        const out = await requestSessionAutoConnect({
          baseUrl,
          apiToken: liveState.apiToken,
          courseraUserId: overrides.courseraUserId,
          degreeIds: overrides.degreeIds,
        });

        if (Result.isError(out)) {
          setBanner(`Session connect failed: ${out.error.message}`, "error");
          return;
        }

        const value = out.value;
        if (value && value.ok) {
          await setState({
            hasSession: true,
            reauthRequired: false,
            courseraUserId: asNumber(value.courseraUserId) ?? undefined,
            degreeIds: asStringArray(value.degreeIds),
            lastStatus: { connect: value },
            lastStatusAt: new Date().toISOString(),
          });
          const cookiesCaptured = asString(value.cookiesCaptured) ?? "0";
          setBanner(`Session uploaded (${cookiesCaptured} cookies)`, "ok");
          await refreshUi();
          return;
        }

        const retrying = Boolean(value?.retrying);
        const message = asString(value?.error) ?? "session upload failed";
        await setState({
          hasSession: false,
          lastStatus: { connect: value },
          lastStatusAt: new Date().toISOString(),
        });

        setBanner(
          retrying ? `Waiting for Coursera detection: ${message}` : `Connect failed: ${message}`,
          retrying ? "neutral" : "error",
        );
        await refreshUi();
      });
    },
    [
      refreshUi,
      runWithBusy,
      setBanner,
      state.form.devBaseUrl,
      state.form.devDegreeIds,
      state.form.devUserId,
    ],
  );

  const onFetchNow = useCallback(async (): Promise<void> => {
    await runWithBusy("fetchNow", async () => {
      const liveState = await getState();
      const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);

      if (!liveState.apiToken) {
        setBanner("Connect Telegram first", "error");
        return;
      }

      setBanner("Running fetch-now...", "neutral");
      const out = await requestFetchNow({
        baseUrl,
        token: liveState.apiToken,
      });

      if (Result.isError(out)) {
        setBanner(`Fetch failed: ${out.error.message}`, "error");
        return;
      }

      await setState({ lastStatus: { fetch: out.value }, lastStatusAt: new Date().toISOString() });
      const itemsSeen = asString(out.value.items_seen) ?? "0";
      const eventsCreated = asString(out.value.events_created) ?? "0";
      setBanner(`Fetch complete (items=${itemsSeen}, events=${eventsCreated})`, "ok");
      await refreshUi();
    });
  }, [refreshUi, runWithBusy, setBanner, state.form.devBaseUrl]);

  const onRefreshStatus = useCallback(async (): Promise<void> => {
    await runWithBusy("refreshStatus", async () => {
      const liveState = await getState();
      const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);

      if (!liveState.apiToken) {
        setBanner("Connect Telegram first", "error");
        return;
      }

      setBanner("Loading status...", "neutral");
      const out = await requestStatus({
        baseUrl,
        token: liveState.apiToken,
      });

      if (Result.isError(out)) {
        setBanner(`Status failed: ${out.error.message}`, "error");
        return;
      }

      await setState({
        lastStatus: { status: out.value },
        lastStatusAt: new Date().toISOString(),
        reauthRequired: Boolean(out.value.reauth_required),
      });
      setBanner("Status refreshed", "ok");
      await refreshUi();
    });
  }, [refreshUi, runWithBusy, setBanner, state.form.devBaseUrl]);

  const startOnboarding = useCallback(async (): Promise<void> => {
    await runWithBusy("onboarding", async () => {
      const liveState = await getState();
      const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);
      const chosenName = state.form.displayName.trim() || liveState.name || undefined;

      setBanner("Creating secure Telegram link...", "neutral");
      const out = await requestOnboardingStart({ baseUrl, name: chosenName });
      if (Result.isError(out)) {
        setBanner(`Onboarding failed: ${out.error.message}`, "error");
        return;
      }

      await setState({
        baseUrl,
        name: chosenName,
        onboardingLinkUrl: out.value.linkUrl,
        onboardingPollToken: out.value.pollToken,
        onboardingExpiresAt: out.value.expiresAt,
      });

      await openTelegramLink(out.value.linkUrl);
      setBanner("Telegram link opened. Send /start in the bot chat.", "ok");
      await refreshUi();
    });
  }, [refreshUi, runWithBusy, setBanner, state.form.devBaseUrl, state.form.displayName]);

  const onCancelOnboarding = useCallback(async (): Promise<void> => {
    await runWithBusy("cancelOnboarding", async () => {
      const liveState = await getState();
      const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);
      const pollToken = liveState.onboardingPollToken?.trim();

      if (!pollToken) {
        setBanner("No pending onboarding to cancel", "error");
        return;
      }

      const out = await requestOnboardingCancel({ baseUrl, pollToken });
      if (Result.isError(out)) {
        setBanner(`Cancel failed: ${out.error.message}`, "error");
        return;
      }

      await setState({
        onboardingPollToken: undefined,
        onboardingLinkUrl: undefined,
        onboardingExpiresAt: undefined,
      });

      setBanner("Pending onboarding cancelled", "ok");
      await refreshUi();
    });
  }, [refreshUi, runWithBusy, setBanner, state.form.devBaseUrl]);

  const onPrimaryAction = useCallback(async (): Promise<void> => {
    const liveState = await getState();

    if (!liveState.apiToken) {
      if (liveState.onboardingPollToken && liveState.onboardingLinkUrl) {
        await openTelegramLink(liveState.onboardingLinkUrl);
        setBanner("Telegram link reopened", "ok");
        return;
      }

      await startOnboarding();
      return;
    }

    if (!liveState.hasSession || liveState.reauthRequired) {
      await connectCourseraSession(false);
      return;
    }

    await onFetchNow();
  }, [connectCourseraSession, onFetchNow, setBanner, startOnboarding]);

  const onOpenTelegram = useCallback(async (): Promise<void> => {
    const liveState = await getState();
    if (!liveState.onboardingLinkUrl) {
      setBanner("No Telegram onboarding link in state", "error");
      return;
    }
    await openTelegramLink(liveState.onboardingLinkUrl);
  }, [setBanner]);

  const onDevRegister = useCallback(async (): Promise<void> => {
    await runWithBusy("devRegister", async () => {
      const liveState = await getState();
      const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);
      const name = state.form.displayName.trim() || liveState.name || "User";
      const telegramChatId = state.form.devTelegramChatId.trim();

      if (!telegramChatId) {
        setBanner("Dev register requires Telegram Chat ID", "error");
        return;
      }

      const out = await requestDevRegister({ baseUrl, name, telegramChatId });
      if (Result.isError(out)) {
        setBanner(`Dev register failed: ${out.error.message}`, "error");
        return;
      }

      const value = out.value as RegisterResponse;
      await setState({
        baseUrl,
        name,
        telegramChatId,
        apiToken: value.api_token,
        userId: value.user_id,
      });

      setBanner("Dev register complete", "ok");
      await refreshUi();
    });
  }, [
    refreshUi,
    runWithBusy,
    setBanner,
    state.form.devBaseUrl,
    state.form.devTelegramChatId,
    state.form.displayName,
  ]);

  const onOpenCoursera = useCallback(async (): Promise<void> => {
    await openCourseraDegrees();
  }, []);

  useEffect(() => {
    void refreshUi().then(() => {
      setBanner("Ready", "neutral");
    });
  }, [refreshUi, setBanner]);

  useEffect(() => {
    if (!state.storedState.onboardingPollToken) return;

    const tick = async (): Promise<void> => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;

      try {
        const liveState = await getState();
        const pollToken = liveState.onboardingPollToken?.trim();
        if (!pollToken) return;

        const baseUrl = getConfiguredBaseUrl(liveState, state.form.devBaseUrl);
        const out = await requestOnboardingPoll({ baseUrl, pollToken });
        if (Result.isError(out)) {
          setBanner(`Polling failed: ${out.error.message}`, "error");
          return;
        }

        const status = asString(out.value.status) ?? "pending";

        if (status === "pending") {
          await refreshUi();
          return;
        }

        if (status === "linked") {
          const apiToken = asString(out.value.api_token);
          const userId = asString(out.value.user_id);
          const telegramChatId = asString(out.value.telegram_chat_id);
          const name = asString(out.value.name);

          if (!apiToken || !userId) {
            setBanner("Linked status missing api token/user id", "error");
            return;
          }

          await setState({
            apiToken,
            userId,
            telegramChatId: telegramChatId ?? undefined,
            name: name ?? undefined,
            hasSession: false,
            onboardingPollToken: undefined,
            onboardingLinkUrl: undefined,
            onboardingExpiresAt: undefined,
          });
          setBanner("Telegram connected. Connecting Coursera session...", "ok");
          await connectCourseraSession(true);
          return;
        }

        if (status === "expired" || status === "cancelled") {
          await setState({
            onboardingPollToken: undefined,
            onboardingLinkUrl: undefined,
            onboardingExpiresAt: undefined,
          });
          setBanner("Onboarding link expired. Generate a new link.", "error");
          await refreshUi();
          return;
        }

        setBanner(`Unexpected onboarding status: ${status}`, "error");
      } finally {
        pollInFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      window.clearInterval(id);
    };
  }, [
    connectCourseraSession,
    refreshUi,
    setBanner,
    state.form.devBaseUrl,
    state.storedState.onboardingPollToken,
  ]);

  return {
    state,
    derived: deriveState(state),
    busy,
    isDevKnobs: IS_DEV_KNOBS,
    actions: {
      setField,
      onPrimaryAction,
      onFetchNow,
      onRefreshStatus,
      onOpenCoursera,
      onOpenTelegram,
      onDevRegister,
      onDevConnect: () => connectCourseraSession(false),
      onCancelOnboarding,
    },
  };
}
