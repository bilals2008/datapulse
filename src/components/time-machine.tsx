import { Cable, History, Wifi } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { InfoField } from "@/components/info-field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoll } from "@/hooks/use-poll";
import {
  formatBytes,
  formatDateTime,
  timelineLabel,
  timelineTooltip,
} from "@/lib/format";
import { api } from "@/lib/ipc";

const HOUR = 3_600;
const WINDOW_HOURS = 24;
const LOOKBACK_HOURS = 7 * 24;

const config = {
  rx: { label: "Download", color: "var(--download)" },
  tx: { label: "Upload", color: "var(--upload)" },
} satisfies ChartConfig;

export function TimeMachine() {
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const [hoursBack, setHoursBack] = useState(0);

  const end = now - hoursBack * HOUR;
  const start = end - WINDOW_HOURS * HOUR;

  const { data } = usePoll(() => api.timeline(start, end), 60_000, [hoursBack]);

  const buckets = data?.buckets ?? [];
  const total = (data?.rx ?? 0) + (data?.tx ?? 0);
  const topInterface = data?.interfaces[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time machine</CardTitle>
        <CardDescription>
          Scrub through the last 7 days — each step shows the 24 hours ending then
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={LOOKBACK_HOURS}
            step={1}
            value={hoursBack}
            onChange={(event) => setHoursBack(Number(event.target.value))}
            aria-label="Scrub through the last 7 days"
            className="w-full cursor-pointer accent-primary"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>7 days ago</span>
            <span className="text-data text-foreground">{formatDateTime(end)}</span>
            <span>now</span>
          </div>
        </div>

        {data ? (
          <ChartContainer config={config} className="h-44 aspect-auto w-full">
            <AreaChart
              data={buckets.map((bucket) => ({
                ...bucket,
                label: timelineLabel(bucket.ts, data.resolution),
                tooltip: timelineTooltip(bucket.ts, data.resolution),
              }))}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tm-rx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--download)", stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: "var(--download)", stopOpacity: 0.03 }} />
                </linearGradient>
                <linearGradient id="tm-tx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--upload)", stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: "var(--upload)", stopOpacity: 0.03 }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={36}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value) => formatBytes(Number(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_value, payload) =>
                      payload?.[0]?.payload?.tooltip ?? ""
                    }
                    formatter={(value, name) => {
                      const entry = config[name as keyof typeof config];
                      return (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span
                              className="size-2 rounded-[2px]"
                              style={{ backgroundColor: entry?.color }}
                            />
                            {entry?.label ?? name}
                          </span>
                          <span className="text-data text-foreground">
                            {formatBytes(Number(value))}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Area
                dataKey="rx"
                type="monotone"
                stackId="a"
                stroke="var(--download)"
                strokeWidth={1.6}
                fill="url(#tm-rx)"
              />
              <Area
                dataKey="tx"
                type="monotone"
                stackId="a"
                stroke="var(--upload)"
                strokeWidth={1.6}
                fill="url(#tm-tx)"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <Skeleton className="h-44 w-full" />
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
          <InfoField label="Window total" value={formatBytes(total)} />
          <InfoField
            label="Download"
            value={formatBytes(data?.rx ?? 0)}
          />
          <InfoField label="Upload" value={formatBytes(data?.tx ?? 0)} />
        </div>

        {topInterface ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {topInterface.isWireless ? (
              <Wifi className="size-3.5" />
            ) : (
              <Cable className="size-3.5" />
            )}
            <span>
              Busiest link · <span className="text-foreground">{topInterface.name}</span>{" "}
              ({formatBytes(topInterface.rx + topInterface.tx)})
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="size-3.5" />
            No activity recorded in this window.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
