import { listen } from "@tauri-apps/api/event";
import { MoonStar, ShieldCheck, TrendingUp, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { appInfo, logoUrl, type AppInfo } from "@/lib/apps";
import { formatBytes, formatDateTime } from "@/lib/format";
import { api, type Anomaly } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const POLL_MS = 30_000;

const SEVERITY_STYLES: Record<Anomaly["severity"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] text-[color-mix(in_oklch,var(--warning),var(--foreground)_18%)]",
  low: "bg-muted text-muted-foreground",
};

const KIND_ICONS: Record<Anomaly["kind"], LucideIcon> = {
  spike: TrendingUp,
  night: MoonStar,
};

export function AnomalyFeed() {
  const [items, setItems] = useState<Anomaly[] | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.anomalies(50));
    } catch {
      setItems((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, POLL_MS);
    const unlisten = listen("pulse-anomaly", () => void load());

    return () => {
      window.clearInterval(interval);
      void unlisten.then((dispose) => dispose());
    };
  }, [load]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current?.filter((item) => item.id !== id) ?? current);
    void api.dismissAnomaly(id).catch(() => void 0);
  }, []);

  const dismissAll = useCallback(() => {
    setItems([]);
    void api.dismissAllAnomalies().catch(() => void 0);
  }, []);

  const count = items?.length ?? 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>What ate my data?</CardTitle>
        <CardDescription>
          Unusual hours and overnight transfers detected automatically
        </CardDescription>
        <CardAction>
          {count > 0 ? (
            <Button variant="ghost" size="xs" onClick={dismissAll}>
              Dismiss all
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent
        className={cn(
          "flex flex-1 flex-col gap-2",
          // more than 4 rows scrolls inside the card instead of growing it
          count > 4 && "max-h-[19rem] overflow-y-auto",
        )}
      >
        {items === null ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : count === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <ShieldCheck className="size-8 text-success" />
            <p className="text-sm text-muted-foreground">
              Nothing unusual — your usage looks normal.
            </p>
          </div>
        ) : (
          items.map((item) => <AnomalyRow key={item.id} anomaly={item} onDismiss={dismiss} />)
        )}
      </CardContent>
    </Card>
  );
}

function AnomalyRow({
  anomaly,
  onDismiss,
}: {
  anomaly: Anomaly;
  onDismiss: (id: number) => void;
}) {
  const Icon = KIND_ICONS[anomaly.kind] ?? TrendingUp;

  // helper processes of one app (msedgewebview2.exe, its 6 children) collapse
  // into a single line with their CPU and disk totals added up.
  const apps = new Map<string, AppInfo & { cpu: number; diskWritten: number }>();
  for (const proc of anomaly.procs) {
    const info = appInfo(proc.name);
    const seen = apps.get(info.label);
    if (seen) {
      seen.cpu += proc.cpu;
      seen.diskWritten += proc.diskWritten;
    } else {
      apps.set(info.label, { ...info, cpu: proc.cpu, diskWritten: proc.diskWritten });
    }
  }
  const topApps = [...apps.values()].sort((a, b) => b.cpu - a.cpu).slice(0, 3);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.low,
        )}
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-foreground [text-wrap:pretty]">
          {anomaly.message}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{formatDateTime(anomaly.ts)}</span>
          {anomaly.iface ? <span>Top link · {anomaly.iface}</span> : null}
          {anomaly.baseline > 0 ? (
            <span>baseline {formatBytes(anomaly.baseline)}/h</span>
          ) : null}
        </div>
        {topApps.length > 0 ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>Busy then:</span>
            {topApps.map((app) => (
              <span
                key={app.label}
                className="flex items-center gap-1"
                title={`${formatBytes(app.diskWritten)} written to disk since launch`}
              >
                <AppBadge app={app} />
                <span className="max-w-40 truncate">{app.label}</span>
                <span className="text-data">{Math.round(app.cpu)}%</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        onClick={() => onDismiss(anomaly.id)}
      >
        <X />
      </Button>
    </div>
  );
}

function AppBadge({ app }: { app: AppInfo }) {
  const [failed, setFailed] = useState(false);

  if (!app.slug || failed) {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px] bg-muted text-[9px] font-semibold uppercase leading-none text-muted-foreground">
        {app.label.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={logoUrl(app.slug)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("size-3.5 shrink-0 object-contain", app.mono && "dark:invert")}
    />
  );
}
