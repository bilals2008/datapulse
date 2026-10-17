import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { bucketLabel, bucketTooltipLabel, formatBytes, isFutureHour } from "@/lib/format";
import type { UsageBucket, UsageRange } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const config = {
  rx: { label: "Download", color: "var(--download)" },
  tx: { label: "Upload", color: "var(--upload)" },
} satisfies ChartConfig;

type UsageChartProps = {
  buckets: UsageBucket[];
  range: UsageRange;
  className?: string;
};

export function UsageChart({ buckets, range, className }: UsageChartProps) {
  const data = buckets
    .filter((bucket) => range !== "today" || !isFutureHour(bucket.key))
    .map((bucket) => ({
      ...bucket,
      label: bucketLabel(bucket.key, range),
    }));

  return (
    <ChartContainer config={config} className={cn("aspect-auto w-full", className)}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="usage-rx" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--download)", stopOpacity: 0.3 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--download)", stopOpacity: 0.03 }}
            />
          </linearGradient>
          <linearGradient id="usage-tx" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: "var(--upload)", stopOpacity: 0.3 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "var(--upload)", stopOpacity: 0.03 }}
            />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
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
              labelFormatter={(_value, payload) => {
                const key = payload?.[0]?.payload?.key;
                return key ? bucketTooltipLabel(key, range) : "";
              }}
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
          fill="url(#usage-rx)"
        />
        <Area
          dataKey="tx"
          type="monotone"
          stackId="a"
          stroke="var(--upload)"
          strokeWidth={1.6}
          fill="url(#usage-tx)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
