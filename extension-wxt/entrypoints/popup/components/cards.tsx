import { Badge } from "@/components/ui/8bit/badge";
import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/8bit/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/8bit/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/8bit/empty";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { Separator } from "@/components/ui/8bit/separator";
import { Spinner } from "@/components/ui/8bit/spinner";
import type { BannerKind } from "@/lib/core/types";
import courseraIcon from "../../../assets/coursera-8bit.png";
import appIcon from "../../../assets/icon-8bit.png";
import telegramIcon from "../../../assets/telegram-8bit.png";

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

function PixelIcon({
  alt,
  src,
  className = "size-4",
}: {
  alt: string;
  src: string;
  className?: string;
}) {
  return <img src={src} alt={alt} className={`pixelated ${className}`} />;
}

const cardHeaderClass = "space-y-1.5 pb-2";
const cardTitleClass = "text-[13px] font-semibold leading-tight tracking-wide";
const cardDescriptionClass = "text-muted-foreground text-[11px] leading-relaxed";
const cardContentClass = "space-y-4";
const fieldGroupClass = "space-y-2";
const fieldLabelClass = "block text-[11px] font-medium leading-none";
const compactInputClass =
  "w-full px-2 text-[10px] leading-tight placeholder:text-[9px] placeholder:leading-tight";
const infoPanelClass = "space-y-1.5 border border-border/70 bg-muted/20 px-3 py-2.5";
const actionGridClass = "grid grid-cols-1 gap-3";
const fullWidthButtonClass =
  "mx-0 my-1 min-h-9 w-full justify-center gap-1.5 px-2 text-[11px] leading-tight text-center";
const multiLineButtonClass = `${fullWidthButtonClass} whitespace-normal break-words`;
const emptyContainerClass = "items-center border border-foreground px-3 py-4 text-center";
const emptyHeaderClass = "items-center gap-1.5 text-center";
const collapsibleClass = "space-y-2.5";

type CardHeadingProps = {
  title: string;
  description: string;
  iconSrc?: string;
  iconAlt?: string;
};

function CardHeading({ title, description, iconSrc, iconAlt }: CardHeadingProps) {
  return (
    <CardHeader className={cardHeaderClass}>
      <CardTitle className={cardTitleClass}>
        <span className="flex items-center gap-2">
          {iconSrc && iconAlt ? <PixelIcon src={iconSrc} alt={iconAlt} /> : null}
          {title}
        </span>
      </CardTitle>
      <CardDescription className={cardDescriptionClass}>{description}</CardDescription>
    </CardHeader>
  );
}

export function StatusHeader({ title, statusText, statusKind }: StatusHeaderProps) {
  return (
    <div className="space-y-2.5 border border-border/70 bg-card/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <PixelIcon src={appIcon} alt="Coursera Deadline Tracker icon" className="size-4 shrink-0" />
        <h1 className="retro text-sm leading-none text-foreground">{title}</h1>
      </div>
      <Badge
        variant={statusBadgeVariant(statusKind)}
        className="w-full justify-start whitespace-normal break-words px-2 py-0.5 text-left text-[10px] leading-relaxed"
      >
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
  isPrimaryBusy: boolean;
  isSessionBusy: boolean;
  onDisplayNameChange: (value: string) => void;
  onPrimaryAction: () => void;
  onOpenTelegram: () => void;
};

export function QuickSetupCard(props: QuickSetupCardProps) {
  const isPrimaryDisabled = props.isPrimaryBusy || props.isSessionBusy;

  return (
    <Card>
      <CardHeading
        title="Quick Setup"
        description="Connect Telegram and set your preferred display name."
        iconSrc={telegramIcon}
        iconAlt="Telegram icon"
      />
      <CardContent className={cardContentClass}>
        <div className={fieldGroupClass}>
          <Label htmlFor="display-name" className={fieldLabelClass}>
            Name (optional)
          </Label>
          <Input
            id="display-name"
            className={compactInputClass}
            value={props.displayName}
            onChange={(event) => props.onDisplayNameChange(event.target.value)}
            placeholder="Satty"
          />
        </div>

        <div className={infoPanelClass}>
          <p className={cardDescriptionClass}>{props.onboardingHint}</p>
        </div>

        <Separator />

        <div className={actionGridClass}>
          <Button
            className={fullWidthButtonClass}
            onClick={props.onPrimaryAction}
            disabled={isPrimaryDisabled}
          >
            {props.isPrimaryBusy ? <Spinner variant="diamond" className="size-3" /> : null}
            {props.primaryButtonText}
          </Button>
          <Button
            className={fullWidthButtonClass}
            variant="secondary"
            onClick={props.onOpenTelegram}
            disabled={!props.canOpenTelegramLink || isPrimaryDisabled}
          >
            <PixelIcon src={telegramIcon} alt="Open Telegram" className="size-3.5 shrink-0" />
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
  const hasAutoDetection = !autoDetectHint.startsWith("No auto-detected");

  return (
    <Card>
      <CardHeading
        title="Coursera Detection"
        description="Auto-detect degree metadata by opening your Coursera degree page."
        iconSrc={courseraIcon}
        iconAlt="Coursera icon"
      />
      <CardContent className={cardContentClass}>
        {hasAutoDetection ? (
          <div className={infoPanelClass}>
            <p className={cardDescriptionClass}>{autoDetectHint}</p>
          </div>
        ) : (
          <Empty className={emptyContainerClass}>
            <EmptyHeader className={emptyHeaderClass}>
              <EmptyMedia variant="icon">
                <PixelIcon src={courseraIcon} alt="Coursera pending detection" className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No Auto-Detection Yet</EmptyTitle>
              <EmptyDescription className={cardDescriptionClass}>{autoDetectHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <Separator />
        <Button className={fullWidthButtonClass} variant="secondary" onClick={onOpenCoursera}>
          <PixelIcon src={courseraIcon} alt="Open Coursera" className="size-3.5 shrink-0" />
          Open Coursera
        </Button>
      </CardContent>
    </Card>
  );
}

type SyncCardProps = {
  hasToken: boolean;
  hasStatus: boolean;
  statusSummary: string;
  statusText: string;
  isFetchBusy: boolean;
  isRefreshBusy: boolean;
  onFetchNow: () => void;
  onRefreshStatus: () => void;
};

export function SyncCard({
  hasToken,
  hasStatus,
  statusSummary,
  statusText,
  isFetchBusy,
  isRefreshBusy,
  onFetchNow,
  onRefreshStatus,
}: SyncCardProps) {
  const isActionBusy = isFetchBusy || isRefreshBusy;

  return (
    <Card>
      <CardHeading
        title="Sync"
        description="Pull latest deadlines and inspect the extension status payload."
      />
      <CardContent className={cardContentClass}>
        <div className={actionGridClass}>
          <Button
            className={fullWidthButtonClass}
            onClick={onFetchNow}
            disabled={!hasToken || isActionBusy}
          >
            {isFetchBusy ? <Spinner variant="diamond" className="size-3" /> : null}
            Fetch Now
          </Button>
          <Button
            className={fullWidthButtonClass}
            variant="secondary"
            onClick={onRefreshStatus}
            disabled={!hasToken || isActionBusy}
          >
            {isRefreshBusy ? <Spinner variant="diamond" className="size-3" /> : null}
            Refresh Status
          </Button>
        </div>

        <Separator />

        {hasStatus ? (
          <Collapsible className={collapsibleClass}>
            <div className={infoPanelClass}>
              <p className={cardDescriptionClass}>{statusSummary}</p>
            </div>
            <CollapsibleTrigger asChild>
              <Button className={fullWidthButtonClass} variant="secondary">
                View Raw Payload
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="h-28 overflow-auto border border-foreground bg-card p-2 text-xs leading-relaxed text-foreground">
                {statusText}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Empty className={emptyContainerClass}>
            <EmptyHeader className={emptyHeaderClass}>
              <EmptyMedia variant="icon">
                <PixelIcon src={appIcon} alt="No sync data yet" className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">No Status Yet</EmptyTitle>
              <EmptyDescription className={cardDescriptionClass}>
                Run Fetch Now or Refresh Status after connecting.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

export function TokenCard({ tokenHint }: { tokenHint: string }) {
  const hasToken = tokenHint !== "Not registered";

  return (
    <Card>
      <CardHeading title="Token Details" description="Review the registered user/token snapshot." />
      <CardContent className="space-y-3.5">
        {hasToken ? (
          <Collapsible className={collapsibleClass}>
            <div className={infoPanelClass}>
              <p className={cardDescriptionClass}>Current token/user</p>
            </div>
            <CollapsibleTrigger asChild>
              <Button className={fullWidthButtonClass} variant="secondary">
                View Token Snapshot
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="break-all border border-foreground bg-card p-2 text-xs leading-relaxed text-foreground">
                {tokenHint}
              </p>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Empty className={emptyContainerClass}>
            <EmptyContent className="items-center gap-2 text-center">
              <EmptyTitle className="text-sm">Not Connected</EmptyTitle>
              <EmptyDescription className={cardDescriptionClass}>
                Connect Telegram to create your account token.
              </EmptyDescription>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

type DevKnobsCardProps = {
  devBaseUrl: string;
  devTelegramChatId: string;
  devUserId: string;
  devDegreeIds: string;
  isDevRegisterBusy: boolean;
  isDevConnectBusy: boolean;
  isCancelBusy: boolean;
  onDevBaseUrlChange: (value: string) => void;
  onDevTelegramChatIdChange: (value: string) => void;
  onDevUserIdChange: (value: string) => void;
  onDevDegreeIdsChange: (value: string) => void;
  onDevRegister: () => void;
  onDevConnect: () => void;
  onCancelOnboarding: () => void;
};

export function DevKnobsCard(props: DevKnobsCardProps) {
  const disableDevButtons = props.isDevRegisterBusy || props.isDevConnectBusy || props.isCancelBusy;

  return (
    <Card>
      <CardHeading
        title="Dev Manual Controls"
        description="Override API/session fields for local debugging and manual flows."
      />
      <CardContent className={cardContentClass}>
        <div className={fieldGroupClass}>
          <Label htmlFor="dev-base-url" className={fieldLabelClass}>
            Worker Base URL
          </Label>
          <Input
            id="dev-base-url"
            className={compactInputClass}
            value={props.devBaseUrl}
            onChange={(event) => props.onDevBaseUrlChange(event.target.value)}
            placeholder="http://127.0.0.1:8787"
          />
        </div>

        <div className={fieldGroupClass}>
          <Label htmlFor="dev-telegram-chat-id" className={fieldLabelClass}>
            Telegram Chat ID (manual register)
          </Label>
          <Input
            id="dev-telegram-chat-id"
            className={compactInputClass}
            value={props.devTelegramChatId}
            onChange={(event) => props.onDevTelegramChatIdChange(event.target.value)}
            placeholder="5554014503"
          />
        </div>

        <div className={fieldGroupClass}>
          <Label htmlFor="dev-coursera-user-id" className={fieldLabelClass}>
            Coursera User ID (optional override)
          </Label>
          <Input
            id="dev-coursera-user-id"
            type="number"
            className={compactInputClass}
            value={props.devUserId}
            onChange={(event) => props.onDevUserIdChange(event.target.value)}
            placeholder="144497456"
          />
        </div>

        <div className={fieldGroupClass}>
          <Label htmlFor="dev-degree-ids" className={fieldLabelClass}>
            Degree IDs (comma-separated, optional override)
          </Label>
          <Input
            id="dev-degree-ids"
            className={compactInputClass}
            value={props.devDegreeIds}
            onChange={(event) => props.onDevDegreeIdsChange(event.target.value)}
            placeholder="base~TN5kB6C5TC-GO9O2tK-0CQ"
          />
        </div>

        <div className={actionGridClass}>
          <Button
            className={fullWidthButtonClass}
            variant="secondary"
            onClick={props.onDevRegister}
            disabled={disableDevButtons}
          >
            {props.isDevRegisterBusy ? <Spinner variant="diamond" className="size-3" /> : null}
            Dev Register
          </Button>
          <Button
            className={fullWidthButtonClass}
            variant="secondary"
            onClick={props.onDevConnect}
            disabled={disableDevButtons}
          >
            {props.isDevConnectBusy ? <Spinner variant="diamond" className="size-3" /> : null}
            Dev Connect
          </Button>
        </div>

        <Separator />

        <Button
          className={multiLineButtonClass}
          variant="destructive"
          onClick={props.onCancelOnboarding}
          disabled={disableDevButtons}
        >
          {props.isCancelBusy ? <Spinner variant="diamond" className="size-3" /> : null}
          Cancel Pending Onboarding
        </Button>
      </CardContent>
    </Card>
  );
}
