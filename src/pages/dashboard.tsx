import { ArrowDown, ArrowUp } from "lucide-react";

import { InfoField } from "@/components/info-field";
import { LiveSparkline } from "@/components/live-sparkline";
import { NetworkCard } from "@/components/network-card";
import { QuotaCard } from "@/components/quota-card";
import { UsageChart } from "@/components/usage-chart";
import { WrappedCard } from "@/components/wrapped-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLiveStats } from "@/hooks/use-live-stats";
import { usePoll } from "@/hooks/use-poll";
import { useSettings } from "@/hooks/use-settings";
import {
  formatBytes,
  formatMoney,
  formatRate,
  isActiveRate,
  splitBytes,
} from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type DashboardViewProps = {
  onOpenSettings: () => void;
};

export function DashboardView({ onOpenSettings }: DashboardViewProps) {
  const { latest, history } = useLiveStats();
  const { settings } = useSettings();
  const { data: today } = usePoll(() => api.usageSeries("today"), 20000);
  const { data: week } = usePoll(() => api.usageSeries("7d"), 60000);
  const { data: marks } = usePoll(() => api.anomalyMarks("today"), 30000);
  const now = new Date();
  const yearEnd = now.getMonth() === 11 && now.getDate() >= 25;

  const rx = latest?.rxRate ?? 0;
  const tx = latest?.txRate ?? 0;
  const down = splitBytes(rx);
  const up = splitBytes(tx);
  const live = isActiveRate(rx + tx);

  const weekTotal = (week?.rx ?? 0) + (week?.tx ?? 0);
  const todayTotal = (today?.rx ?? 0) + (today?.tx ?? 0);
  const todayCost = formatMoney(
    todayTotal,
    settings?.ratePerGb ?? 0,
    settings?.currency ?? "",
  );

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Live throughput</CardTitle>
            <CardDescription>
              Current transfer rate across all active adapters
            </CardDescription>
            <CardAction>
              <Badge variant="secondary" className="gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    live ? "bg-success" : "bg-muted-foreground/50",
                  )}
                />
                {live ? "Active" : "Idle"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-10">
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowDown className="size-3.5 text-download" />
                  Download
                </span>
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-data text-4xl leading-none font-medium tracking-tight">
                    {down.value}
                  </span>
                  <span className="text-data text-base text-muted-foreground">
                    {down.unit}/s
                  </span>
                </span>
              </div>
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUp className="size-3.5 text-upload" />
                  Upload
                </span>
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-data text-4xl leading-none font-medium tracking-tight">
                    {up.value}
                  </span>
                  <span className="text-data text-base text-muted-foreground">
                    {up.unit}/s
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-5">
              <LiveSparkline data={history} />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:flex-1">
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>Hourly transfer for the current day</CardDescription>
            <CardAction className="flex items-center gap-4">
              {marks && marks.length > 0 ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-warning" />
                  Unusual
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-[2px] bg-download" />
                Download
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-[2px] bg-upload" />
                Upload
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <UsageChart
              buckets={today?.buckets ?? []}
              range="today"
              marks={marks ?? []}
              className="h-64 xl:h-full"
            />
          </CardContent>
          <CardFooter className={cn("grid gap-4", todayCost ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
            <InfoField label="Today" value={formatBytes(todayTotal)} />
            {todayCost ? <InfoField label="Today's cost" value={todayCost} /> : null}
            <InfoField label="This week" value={formatBytes(weekTotal)} />
            <InfoField
              label="Daily average"
              value={formatBytes(weekTotal / 7)}
            />
          </CardFooter>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <QuotaCard onOpenSettings={onOpenSettings} />
        <NetworkCard />
        <Card>
          <CardHeader>
            <CardTitle>This session</CardTitle>
            <CardDescription>Since DataPulse started</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <InfoField
              label="Downloaded"
              value={formatBytes(latest?.sessionRx ?? 0)}
            />
            <InfoField
              label="Uploaded"
              value={formatBytes(latest?.sessionTx ?? 0)}
            />
            <InfoField label="Download rate" value={formatRate(rx)} />
            <InfoField label="Upload rate" value={formatRate(tx)} />
          </CardContent>
        </Card>

        {/* Kept off the dashboard until the last week of the year. */}
        {yearEnd ? <WrappedCard /> : null}
      </div>
    </div>
  );
}
