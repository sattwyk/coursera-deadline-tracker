import { asNumber } from "@/lib/core/popup";
import type { AutoDetection, BannerKind, State } from "@/lib/core/types";
import type { PopupUiState } from "./controller-types";

type SyncPayload = {
  storedState: State;
  auto: AutoDetection;
  isDevKnobsEnabled: boolean;
  defaultBaseUrl: string;
};

type PopupAction =
  | { type: "sync"; payload: SyncPayload }
  | { type: "set-banner"; payload: { text: string; kind: BannerKind } }
  | { type: "set-field"; payload: { field: keyof PopupUiState["form"]; value: string } };

export const initialPopupUiState: PopupUiState = {
  storedState: {},
  auto: {},
  form: {
    displayName: "",
    devBaseUrl: "",
    devTelegramChatId: "",
    devUserId: "",
    devDegreeIds: "",
  },
  banner: {
    text: "Idle",
    kind: "neutral",
  },
};

function mergeFormFromStorage(state: PopupUiState, payload: SyncPayload): PopupUiState["form"] {
  const { storedState, auto, isDevKnobsEnabled, defaultBaseUrl } = payload;

  const nextForm = {
    ...state.form,
    displayName: state.form.displayName || storedState.name || "",
  };

  if (!isDevKnobsEnabled) {
    return nextForm;
  }

  const detected = asNumber(auto.courseraUserId ?? storedState.autoCourseraUserId);
  const selected = asNumber(storedState.courseraUserId) ?? detected;

  const detectedDegreeIds = Array.isArray(auto.degreeIds)
    ? auto.degreeIds
    : Array.isArray(storedState.autoDegreeIds)
      ? storedState.autoDegreeIds
      : [];
  const selectedDegreeIds =
    Array.isArray(storedState.degreeIds) && storedState.degreeIds.length > 0
      ? storedState.degreeIds
      : detectedDegreeIds;

  return {
    ...nextForm,
    devBaseUrl: state.form.devBaseUrl || storedState.baseUrl || defaultBaseUrl,
    devTelegramChatId: state.form.devTelegramChatId || storedState.telegramChatId || "",
    devUserId: state.form.devUserId || (selected ? String(selected) : ""),
    devDegreeIds: state.form.devDegreeIds || selectedDegreeIds.join(","),
  };
}

export function popupReducer(state: PopupUiState, action: PopupAction): PopupUiState {
  if (action.type === "sync") {
    return {
      ...state,
      storedState: action.payload.storedState,
      auto: action.payload.auto,
      form: mergeFormFromStorage(state, action.payload),
    };
  }

  if (action.type === "set-banner") {
    return {
      ...state,
      banner: action.payload,
    };
  }

  if (action.type === "set-field") {
    return {
      ...state,
      form: {
        ...state.form,
        [action.payload.field]: action.payload.value,
      },
    };
  }

  return state;
}
