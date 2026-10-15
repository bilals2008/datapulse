import { ArrowDown, ArrowUp, Cable, Wifi } from "lucide-react";

import { InfoField } from "@/components/info-field";
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
import { formatBytes, formatDayKeyShort, formatHour } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export function WeeklyRecap() {
  const { data } = usePoll(api.recap, 30000);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>Rolling 7-day transfer versus last week</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasBaseline = data.lastWeek > 0;
  const up = data.deltaPercent >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week</CardTitle>
        <CardDescription>Rolling 7-day transfer versus last week</CardDescription>
        <CardAction>
          {hasBaseline ? (
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                up ? "text-warning" : "text-success",
              )}
            >
              {up ? (
                <ArrowUp className="size-3.5" />
              ) : (
                <ArrowDown className="size-3.5" />
              )}
              {Math.abs(data.deltaPercent).toFixed(0)}%
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No prior week</span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-data text-3xl leading-none font-medium tracking-tight">
            {formatBytes(data.thisWeek)}
          </span>
          <span className="text-xs text-muted-foreground">
            {hasBaseline
              ? `${up ? "up" : "down"} from ${formatBytes(data.lastWeek)} last week`
              : "no previous week to compare"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          <InfoField label="Last week" value={formatBytes(data.lastWeek)} />
          <InfoField label="Average / day" value={formatBytes(data.avgDaily)} />
          <InfoField
            label="Busiest day"
            value={
              data.busiestDay
                ? `${formatDayKeyShort(data.busiestDay.day)} · ${formatBytes(data.busiestDay.bytes)}`
                : "—"
            }
          />
          <InfoField
            label="Peak hour"
            value={data.busiestHour === null ? "—" : formatHour(data.busiestHour)}
          />
          <InfoField
            label="Top link"
            value={
              data.topInterface ? (
                <span className="flex items-center gap-1.5">
                  {data.topInterface.isWireless ? (
                    <Wifi className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Cable className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate">{data.topInterface.name}</span>
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
