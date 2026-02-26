import {
  DetectionCard,
  DevKnobsCard,
  QuickSetupCard,
  StatusHeader,
  SyncCard,
  TokenCard,
} from "./components/cards";
import { usePopupController } from "./usePopupController";

function App() {
  const { state, derived, isDevKnobs, actions } = usePopupController();

  return (
    <div className="w-[380px] min-h-[560px] bg-background p-4">
      <StatusHeader
        title="Coursera Deadline Tracker"
        statusText={state.banner.text}
        statusKind={state.banner.kind}
      />

      <div className="space-y-3">
        <QuickSetupCard
          displayName={state.form.displayName}
          onboardingHint={derived.onboardingHint}
          primaryButtonText={derived.primaryButtonText}
          canOpenTelegramLink={derived.canOpenTelegramLink}
          onDisplayNameChange={(value) => actions.setField("displayName", value)}
          onPrimaryAction={() => void actions.onPrimaryAction()}
          onOpenTelegram={() => void actions.onOpenTelegram()}
        />

        <DetectionCard
          autoDetectHint={derived.autoDetectHint}
          onOpenCoursera={() => void actions.onOpenCoursera()}
        />

        <SyncCard
          hasToken={derived.hasToken}
          statusText={derived.statusText}
          onFetchNow={() => void actions.onFetchNow()}
          onRefreshStatus={() => void actions.onRefreshStatus()}
        />

        <TokenCard tokenHint={derived.tokenHint} />

        {isDevKnobs ? (
          <DevKnobsCard
            devBaseUrl={state.form.devBaseUrl}
            devTelegramChatId={state.form.devTelegramChatId}
            devUserId={state.form.devUserId}
            devDegreeIds={state.form.devDegreeIds}
            onDevBaseUrlChange={(value) => actions.setField("devBaseUrl", value)}
            onDevTelegramChatIdChange={(value) => actions.setField("devTelegramChatId", value)}
            onDevUserIdChange={(value) => actions.setField("devUserId", value)}
            onDevDegreeIdsChange={(value) => actions.setField("devDegreeIds", value)}
            onDevRegister={() => void actions.onDevRegister()}
            onDevConnect={() => void actions.onDevConnect()}
            onCancelOnboarding={() => void actions.onCancelOnboarding()}
          />
        ) : null}
      </div>
    </div>
  );
}

export default App;
