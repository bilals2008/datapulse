import { Gauge, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { formatBytes, formatDay, formatDays, formatShortDate } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const config = {
  actual: { label: "Actual", color: "var(--download)" },
  projected: { label: "Projected", color: "var(--primary)" },
  budget: { label: "Allowance", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type ForecastCardProps = {
  onOpenSettings: () => void;
};

export function ForecastCard({ onOpenSettings }: ForecastCardProps) {
  const { data } = usePoll(api.quotaStatus, 15000);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
          <CardDescription>Projected usage for this period</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Forecast</CardTitle>
          <CardDescription>
            Set a monthly allowance to project where you will land.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            <Gauge data-icon="inline-start" />
            Set a data cap
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lastActualIndex = data.burn.reduce(
    (last, point, index) => (point.actual > 0 ? index : last),
    -1,
  );
  const points = data.burn.map((point, index) => ({
    label: formatShortDate(point.ts),
    tooltip: formatDay(point.ts),
    budget: point.budget,
    projected: point.projected,
    actual: index <= lastActualIndex ? point.actual : null,
  }));

  const overBudget = data.overBudget;
  const headline = overBudget
    ? `Projected ${formatBytes(data.forecastBytes)} — over budget`
    : `Projected ${formatBytes(data.forecastBytes)} — within budget`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast</CardTitle>
        <CardDescription>
          Day-by-day burn-down against your {formatBytes(data.limitBytes)} allowance
        </CardDescription>
        <CardAction>
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              overBudget ? "text-destructive" : "text-success",
            )}
          >
            <TrendingUp className="size-3.5" />
            {overBudget ? "On pace to exceed" : "On track"}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={config} className="h-44 aspect-auto w-full">
          <LineChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
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
                          {value == null ? "—" : formatBytes(Number(value))}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Line
              dataKey="budget"
              type="monotone"
              stroke="var(--muted-foreground)"
              strokeWidth={1.3}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              dataKey="projected"
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={1.8}
              dot={false}
            />
            <Line
              dataKey="actual"
              type="monotone"
              stroke="var(--download)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ChartContainer>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {(["actual", "projected", "budget"] as const).map((key) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: config[key].color }}
              />
              {config[key].label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-4">
          <Metric label="Average / day" value={formatBytes(data.avgDaily)} />
          <Metric label="Safe / day" value={formatBytes(data.dailyBudget)} />
          <Metric label="Forecast total" value={formatBytes(data.forecastBytes)} highlight={overBudget} />
          <Metric label="Cap reached in" value={formatDays(data.daysToLimit)} />
        </div>

        <p className="text-xs text-muted-foreground">{headline}</p>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn("text-data text-[13px]", highlight && "text-destructive")}
      >
        {value}
      </span>
    </div>
  );
}
