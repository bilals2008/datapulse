import { listen } from "@tauri-apps/api/event";
import { Activity, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { usePoll } from "@/hooks/use-poll";
import { formatHour, formatMBps, formatTime } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export function SpeedCard() {
  const [nonce, setNonce] = useState(0);
  const [running, setRunning] = useState(false);
  const { data } = usePoll(api.speedReport, 60000, [nonce]);

  useEffect(() => {
    const unlisten = listen("pulse-speed", () => setNonce((value) => value + 1));
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    try {
      await api.runSpeedtest();
      setNonce((value) => value + 1);
      toast.success("Speed test finished");
    } catch {
      toast.error("Speed test failed — check your connection");
    } finally {
      setRunning(false);
    }
  }, []);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Line speed</CardTitle>
          <CardDescription>ISP throughput by hour of day</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const peak = Math.max(...data.byHour.map((hour) => hour.mbps), 1);
  const latest = data.latest;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Line speed</CardTitle>
        <CardDescription>
          Measured by the built-in test, grouped by hour of day
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="xs"
            disabled={running}
            onClick={() => void runNow()}
          >
            <RefreshCw
              data-icon="inline-start"
              className={cn(running && "animate-spin")}
            />
            {running ? "Testing…" : "Test now"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "text-data text-3xl leading-none font-medium tracking-tight",
                latest.ok ? undefined : "text-destructive",
              )}
            >
              {latest.ok ? formatMBps(latest.downBps * 8e-6) : "Failed"}
            </span>
            <span className="text-xs text-muted-foreground">
              {latest.ok
                ? `first byte in ${Math.round(latest.latencyMs)} ms · ${formatTime(latest.ts * 1000)}`
                : latest.error}
            </span>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4" />
            No samples yet — run a test now.
          </p>
        )}

        {data.byHour.length > 0 ? (
          <>
            <div className="flex h-20 items-end gap-[2px]" aria-hidden="true">
              {Array.from({ length: 24 }, (_, hour) => {
                const entry = data.byHour.find((item) => item.hour === hour);
                const height = entry ? Math.max((entry.mbps / peak) * 100, 3) : 1;
                return (
                  <div
                    key={hour}
                    title={
                      entry
                        ? `${formatHour(hour)} · ${formatMBps(entry.mbps)} (${entry.samples})`
                        : `${formatHour(hour)} · no samples`
                    }
                    style={{ height: `${height}%` }}
                    className={cn(
                      "flex-1 rounded-[2px]",
                      !entry
                        ? "bg-muted-foreground/15"
                        : data.best?.hour === hour
                          ? "bg-primary"
                          : "bg-download",
                    )}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
              <Metric
                label="Fastest hour"
                value={
                  data.best
                    ? `${formatHour(data.best.hour)} · ${formatMBps(data.best.mbps)}`
                    : "—"
                }
              />
              <Metric
                label="Slowest hour"
                value={
                  data.worst
                    ? `${formatHour(data.worst.hour)} · ${formatMBps(data.worst.mbps)}`
                    : "—"
                }
              />
            </div>
          </>
        ) : null}

        {!data.enabled ? (
          <p className="text-xs text-muted-foreground">
            Turn on the hourly speed test in Settings to build this picture
            automatically.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-data text-[13px]">{value}</span>
    </div>
  );
}
