import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { bucketLabel, bucketTooltipLabel, formatBytes, isFutureHour } from "@/lib/format";
import type { AnomalyMark, UsageBucket, UsageRange } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const config = {
  rx: { label: "Download", color: "var(--download)" },
  tx: { label: "Upload", color: "var(--upload)" },
} satisfies ChartConfig;

const MARK_LABELS: Record<AnomalyMark["kind"], string> = {
  spike: "unusual spike",
  night: "overnight transfer",
};

/** The `plan_series` bucket key for an anomaly timestamp, in local time. */
function bucketKey(ts: number, range: UsageRange): string {
  const date = new Date(ts * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  if (range === "today") return `${day} ${pad(date.getHours())}`;
  if (range === "12m") return day.slice(0, 7);
  return day;
}

type UsageChartProps = {
  buckets: UsageBucket[];
  range: UsageRange;
  marks?: AnomalyMark[];
  className?: string;
};

export function UsageChart({ buckets, range, marks, className }: UsageChartProps) {
  const marked = new Map<string, AnomalyMark["kind"]>();
  for (const mark of marks ?? []) marked.set(bucketKey(mark.ts, range), mark.kind);

  const data = buckets
    .filter((bucket) => range !== "today" || !isFutureHour(bucket.key))
    .map((bucket) => ({
      ...bucket,
      label: bucketLabel(bucket.key, range),
      mark: marked.get(bucket.key),
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
                const row = payload?.[0]?.payload;
                if (!row?.key) return "";
                const label = bucketTooltipLabel(row.key, range);
                return row.mark
                  ? `${label} · ${MARK_LABELS[row.mark as AnomalyMark["kind"]] ?? "unusual"}`
                  : label;
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
        {data
          .filter((bucket) => bucket.mark)
          .map((bucket) => (
            <ReferenceDot
              key={bucket.key}
              x={bucket.label}
              y={bucket.rx + bucket.tx}
              r={3}
              fill="var(--warning)"
              stroke="var(--background)"
              strokeWidth={1.5}
            />
          ))}
      </AreaChart>
    </ChartContainer>
  );
}
