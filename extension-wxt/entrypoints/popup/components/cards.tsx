import { Badge } from "@/components/ui/8bit/badge";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import type { BannerKind } from "@/lib/core/types";

type StatusHeaderProps = {
  title: string;
  statusText: string;
  statusKind: BannerKind;
};

function statusBadgeVariant(kind: BannerKind): "default" | "secondary" | "destructive" {
  if (kind === "ok") return "default";
  if (kind === "error") return "destructive";
  return "secondary";
}

export function StatusHeader({ title, statusText, statusKind }: StatusHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h1 className="retro text-sm text-foreground">{title}</h1>
      <Badge variant={statusBadgeVariant(statusKind)} className="text-[9px]">
        {statusText}
      </Badge>
    </div>
  );
}

type QuickSetupCardProps = {
  displayName: string;
  onboardingHint: string;
  primaryButtonText: string;
  canOpenTelegramLink: boolean;
  onDisplayNameChange: (value: string) => void;
  onPrimaryAction: () => void;
  onOpenTelegram: () => void;
};

export function QuickSetupCard(props: QuickSetupCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Quick Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="display-name">Name (optional)</Label>
          <Input
            id="display-name"
            value={props.displayName}
            onChange={(event) => props.onDisplayNameChange(event.target.value)}
            placeholder="Satty"
          />
        </div>

        <p className="retro text-[10px] text-muted-foreground">{props.onboardingHint}</p>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={props.onPrimaryAction}>{props.primaryButtonText}</Button>
          <Button
            variant="secondary"
            onClick={props.onOpenTelegram}
            disabled={!props.canOpenTelegramLink}
          >
            Open Telegram
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type DetectionCardProps = {
  autoDetectHint: string;
  onOpenCoursera: () => void;
};

export function DetectionCard({ autoDetectHint, onOpenCoursera }: DetectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Coursera Detection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="retro text-[10px] text-muted-foreground">
          Open your Coursera degree page once so IDs can be detected automatically.
        </p>
        <p className="retro text-[10px] text-muted-foreground">{autoDetectHint}</p>
        <Button variant="secondary" onClick={onOpenCoursera}>
          Open Coursera
        </Button>
      </CardContent>
    </Card>
  );
}

type SyncCardProps = {
  hasToken: boolean;
  statusText: string;
  onFetchNow: () => void;
  onRefreshStatus: () => void;
};

export function SyncCard({ hasToken, statusText, onFetchNow, onRefreshStatus }: SyncCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onFetchNow} disabled={!hasToken}>
            Fetch Now
          </Button>
          <Button variant="secondary" onClick={onRefreshStatus} disabled={!hasToken}>
            Refresh Status
          </Button>
        </div>

        <pre className="retro h-[108px] overflow-auto border border-foreground bg-card p-2 text-[9px] text-foreground">
          {statusText}
        </pre>
      </CardContent>
    </Card>
  );
}

export function TokenCard({ tokenHint }: { tokenHint: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <p className="retro text-[10px] text-muted-foreground">Current token/user</p>
        <p className="retro break-all text-[9px] text-foreground">{tokenHint}</p>
      </CardContent>
    </Card>
  );
}

type DevKnobsCardProps = {
  devBaseUrl: string;
  devTelegramChatId: string;
  devUserId: string;
  devDegreeIds: string;
  onDevBaseUrlChange: (value: string) => void;
  onDevTelegramChatIdChange: (value: string) => void;
  onDevUserIdChange: (value: string) => void;
  onDevDegreeIdsChange: (value: string) => void;
  onDevRegister: () => void;
  onDevConnect: () => void;
  onCancelOnboarding: () => void;
};

export function DevKnobsCard(props: DevKnobsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs">Dev Manual Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="dev-base-url">Worker Base URL</Label>
          <Input
            id="dev-base-url"
            value={props.devBaseUrl}
            onChange={(event) => props.onDevBaseUrlChange(event.target.value)}
            placeholder="http://127.0.0.1:8787"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="dev-telegram-chat-id">Telegram Chat ID (manual register)</Label>
          <Input
            id="dev-telegram-chat-id"
            value={props.devTelegramChatId}
            onChange={(event) => props.onDevTelegramChatIdChange(event.target.value)}
            placeholder="5554014503"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="dev-coursera-user-id">Coursera User ID (optional override)</Label>
          <Input
            id="dev-coursera-user-id"
            type="number"
            value={props.devUserId}
            onChange={(event) => props.onDevUserIdChange(event.target.value)}
            placeholder="144497456"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="dev-degree-ids">Degree IDs (comma-separated, optional override)</Label>
          <Input
            id="dev-degree-ids"
            value={props.devDegreeIds}
            onChange={(event) => props.onDevDegreeIdsChange(event.target.value)}
            placeholder="base~TN5kB6C5TC-GO9O2tK-0CQ"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={props.onDevRegister}>
            Dev Register
          </Button>
          <Button variant="secondary" onClick={props.onDevConnect}>
            Dev Connect
          </Button>
        </div>

        <Button variant="destructive" onClick={props.onCancelOnboarding}>
          Cancel Pending Onboarding
        </Button>
      </CardContent>
    </Card>
  );
}
