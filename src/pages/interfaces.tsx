import { ArrowDown, ArrowUp, Cable, Wifi } from "lucide-react";
import { useState } from "react";

import { NetworkCard } from "@/components/network-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useLiveStats } from "@/hooks/use-live-stats";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes, formatRate, isActiveRate } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export function InterfacesView() {
  const { latest } = useLiveStats();
  const { data: todayTotals } = usePoll(() => api.interfaceTotals(1), 15000);
  const [showIdle, setShowIdle] = useState(false);

  const totals = new Map((todayTotals ?? []).map((item) => [item.name, item]));
  const interfaces = (latest?.interfaces ?? []).filter((item) => {
    const used = totals.get(item.name);
    const usedBytes = (used?.rx ?? 0) + (used?.tx ?? 0);
    return showIdle || usedBytes > 0 || isActiveRate(item.rxRate + item.txRate);
  });

  return (
    <div className="flex flex-col gap-4">
      <NetworkCard />

      <Card>
        <CardHeader>
          <CardTitle>Network adapters</CardTitle>
          <CardDescription>
            Live rates and usage recorded today for each interface
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Show idle</span>
            <Switch checked={showIdle} onCheckedChange={setShowIdle} />
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {interfaces.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/60">
              {interfaces.map((item) => {
                const used = totals.get(item.name);
                const totalBytes = (used?.rx ?? 0) + (used?.tx ?? 0);
                const active = isActiveRate(item.rxRate + item.txRate);

                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {item.isWireless ? (
                        <Wifi className="size-4" />
                      ) : (
                        <Cable className="size-4" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {item.name}
                        </span>
                        {item.isWireless ? (
                          <Badge variant="secondary">Wi-Fi</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Today · {formatBytes(totalBytes)}
                      </p>
                    </div>

                    <div className="flex items-center gap-5">
                      <span className="flex items-center gap-1.5 text-xs">
                        <ArrowDown
                          className={cn(
                            "size-3.5",
                            active ? "text-download" : "text-muted-foreground/50",
                          )}
                        />
                        <span className="text-data w-20 text-right">
                          {formatRate(item.rxRate)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <ArrowUp
                          className={cn(
                            "size-3.5",
                            active ? "text-upload" : "text-muted-foreground/50",
                          )}
                        />
                        <span className="text-data w-20 text-right">
                          {formatRate(item.txRate)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-2 text-sm text-muted-foreground">
              No active adapters detected.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
