import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowDown, ArrowUp, ExternalLink, Wifi, X } from "lucide-react";
import { useEffect } from "react";

import { LiveSparkline } from "@/components/live-sparkline";
import { Button } from "@/components/ui/button";
import { useLiveStats } from "@/hooks/use-live-stats";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes, formatRate, isActiveRate } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

function hide() {
  void getCurrentWindow().hide();
}

export function TrayPopover() {
  const { latest, history } = useLiveStats();
  const { data: wifi } = usePoll(api.wifiInfo, 15000);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rx = latest?.rxRate ?? 0;
  const tx = latest?.txRate ?? 0;
  const active = isActiveRate(rx + tx);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-2.5">
        <img src="/logo.png" alt="" draggable={false} className="size-4 rounded" />
        <span className="font-heading text-xs font-semibold tracking-tight">
          DataPulse
        </span>
        <span
          className={cn(
            "size-1.5 rounded-full",
            active ? "bg-success" : "bg-muted-foreground/40",
          )}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={hide}
          aria-label="Close"
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="size-3.5" />
        </button>
      </header>

      <div className="flex items-baseline justify-between gap-4 px-3 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <ArrowDown className="size-3.5 shrink-0 text-download" />
          <span className="text-data truncate text-lg font-medium">
            {formatRate(rx)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ArrowUp className="size-3.5 text-upload" />
          <span className="text-data text-lg font-medium">{formatRate(tx)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pt-1.5">
        <LiveSparkline data={history} className="h-full" />
      </div>

      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="size-3.5 shrink-0" />
          <span className="truncate">{wifi?.ssid || "No wireless link"}</span>
          {wifi ? (
            <span className="text-data ml-auto shrink-0 text-foreground">
              {wifi.signalPercent}%
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Down · session
            </span>
            <span className="text-data text-xs">
              {formatBytes(latest?.sessionRx ?? 0)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">
              Up · session
            </span>
            <span className="text-data text-xs">
              {formatBytes(latest?.sessionTx ?? 0)}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={() => void api.openMainWindow()}
        >
          <ExternalLink data-icon="inline-start" />
          Open DataPulse
        </Button>
      </div>
    </div>
  );
}
