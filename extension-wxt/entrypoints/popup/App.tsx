import { useMemo, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/8bit/tabs";
import {
  DetectionCard,
  DevKnobsCard,
  QuickSetupCard,
  StatusHeader,
  SyncCard,
  TokenCard,
} from "./components/cards";
import { usePopupController } from "./usePopupController";

type SectionFrameProps = {
  label: string;
  subtitle: string;
  children: ReactNode;
};

function SectionFrame({ label, subtitle, children }: SectionFrameProps) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p className="retro text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </p>
        <div className="bg-border h-px flex-1" aria-hidden="true" />
      </div>
      <p className="retro text-muted-foreground text-[11px] leading-relaxed">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function App() {
  const { state, derived, busy, isDevKnobs, actions } = usePopupController();
  const primaryActionBusy = useMemo(() => {
    if (!derived.hasToken) return busy.onboarding;
    if (!derived.hasSession || derived.isReauthRequired) return busy.sessionConnect;
    return busy.fetchNow;
  }, [
    busy.fetchNow,
    busy.onboarding,
    busy.sessionConnect,
    derived.hasSession,
    derived.hasToken,
    derived.isReauthRequired,
  ]);

  return (
    <div className="w-96 max-w-full p-4">
      <StatusHeader
        title="Coursera Deadline Tracker"
        statusText={state.banner.text}
        statusKind={state.banner.kind}
      />

      {isDevKnobs ? (
        <Tabs className="mt-4 w-full" defaultValue="main">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="main">Main</TabsTrigger>
            <TabsTrigger value="dev">Dev</TabsTrigger>
          </TabsList>

          <TabsContent value="main" className="mt-4 space-y-5">
            <SectionFrame
              label="Setup"
              subtitle="Connect Telegram and let the extension detect Coursera context for this browser."
            >
              <QuickSetupCard
                displayName={state.form.displayName}
                onboardingHint={derived.onboardingHint}
                primaryButtonText={derived.primaryButtonText}
                canOpenTelegramLink={derived.canOpenTelegramLink}
                isPrimaryBusy={primaryActionBusy}
                isSessionBusy={busy.sessionConnect}
                onDisplayNameChange={(value) => actions.setField("displayName", value)}
                onPrimaryAction={() => void actions.onPrimaryAction()}
                onOpenTelegram={() => void actions.onOpenTelegram()}
              />

              <DetectionCard
                autoDetectHint={derived.autoDetectHint}
                onOpenCoursera={() => void actions.onOpenCoursera()}
              />
            </SectionFrame>

            <SectionFrame
              label="Sync & Status"
              subtitle="Trigger sync manually and inspect the latest payload returned from the worker."
            >
              <SyncCard
                hasToken={derived.hasToken}
                hasStatus={derived.hasStatus}
                statusSummary={derived.statusSummary}
                statusText={derived.statusText}
                isFetchBusy={busy.fetchNow}
                isRefreshBusy={busy.refreshStatus}
                onFetchNow={() => void actions.onFetchNow()}
                onRefreshStatus={() => void actions.onRefreshStatus()}
              />

              <TokenCard tokenHint={derived.tokenHint} />
            </SectionFrame>
          </TabsContent>

          <TabsContent value="dev" className="mt-4 space-y-5">
            <SectionFrame
              label="Diagnostics"
              subtitle="Manual controls for local worker, test IDs, and onboarding fallback actions."
            >
              <DevKnobsCard
                devBaseUrl={state.form.devBaseUrl}
                devTelegramChatId={state.form.devTelegramChatId}
                devUserId={state.form.devUserId}
                devDegreeIds={state.form.devDegreeIds}
                isDevRegisterBusy={busy.devRegister}
                isDevConnectBusy={busy.sessionConnect}
                isCancelBusy={busy.cancelOnboarding}
                onDevBaseUrlChange={(value) => actions.setField("devBaseUrl", value)}
                onDevTelegramChatIdChange={(value) => actions.setField("devTelegramChatId", value)}
                onDevUserIdChange={(value) => actions.setField("devUserId", value)}
                onDevDegreeIdsChange={(value) => actions.setField("devDegreeIds", value)}
                onDevRegister={() => void actions.onDevRegister()}
                onDevConnect={() => void actions.onDevConnect()}
                onCancelOnboarding={() => void actions.onCancelOnboarding()}
              />
            </SectionFrame>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mt-4 space-y-5">
          <SectionFrame
            label="Setup"
            subtitle="Connect Telegram and let the extension detect Coursera context for this browser."
          >
            <QuickSetupCard
              displayName={state.form.displayName}
              onboardingHint={derived.onboardingHint}
              primaryButtonText={derived.primaryButtonText}
              canOpenTelegramLink={derived.canOpenTelegramLink}
              isPrimaryBusy={primaryActionBusy}
              isSessionBusy={busy.sessionConnect}
              onDisplayNameChange={(value) => actions.setField("displayName", value)}
              onPrimaryAction={() => void actions.onPrimaryAction()}
              onOpenTelegram={() => void actions.onOpenTelegram()}
            />

            <DetectionCard
              autoDetectHint={derived.autoDetectHint}
              onOpenCoursera={() => void actions.onOpenCoursera()}
            />
          </SectionFrame>

          <SectionFrame
            label="Sync & Status"
            subtitle="Trigger sync manually and inspect the latest payload returned from the worker."
          >
            <SyncCard
              hasToken={derived.hasToken}
              hasStatus={derived.hasStatus}
              statusSummary={derived.statusSummary}
              statusText={derived.statusText}
              isFetchBusy={busy.fetchNow}
              isRefreshBusy={busy.refreshStatus}
              onFetchNow={() => void actions.onFetchNow()}
              onRefreshStatus={() => void actions.onRefreshStatus()}
            />

            <TokenCard tokenHint={derived.tokenHint} />
          </SectionFrame>
        </div>
      )}
    </div>
  );
}

export default App;
