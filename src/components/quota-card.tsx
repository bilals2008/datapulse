import { Gauge } from "lucide-react";
import { useEffect, useRef } from "react";
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
import { useSettings } from "@/hooks/use-settings";
import { formatBytes, formatDay, formatMoney } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type QuotaCardProps = {
  onOpenSettings: () => void;
};

export function QuotaCard({ onOpenSettings }: QuotaCardProps) {
  const { data } = usePoll(api.quotaStatus, 15000);
  const { settings } = useSettings();
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!data?.enabled || data.limitBytes <= 0) return;
    const percent = (data.usedBytes / data.limitBytes) * 100;
    ([80, 100] as const).forEach((threshold) => {
      if (percent >= threshold && !fired.current.has(threshold)) {
        fired.current.add(threshold);
        toast.warning(`Data cap ${threshold}% reached`, {
          description: `${formatBytes(data.usedBytes)} of ${formatBytes(
            data.limitBytes,
          )} used this period`,
        });
      }
    });
  }, [data]);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data cap</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data cap</CardTitle>
          <CardDescription>
            Set a monthly allowance to track your usage against it.
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

  const percent = (data.usedBytes / data.limitBytes) * 100;
  const clamped = Math.min(percent, 100);
  const remaining = Math.max(data.limitBytes - data.usedBytes, 0);
  const overBudget = data.projectedBytes > data.limitBytes;
  const spent = formatMoney(
    data.usedBytes,
    settings?.ratePerGb ?? 0,
    settings?.currency ?? "",
  );
  const barColor =
    percent >= 100
      ? "var(--destructive)"
      : percent >= 80
        ? "var(--warning)"
        : "var(--primary)";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data cap</CardTitle>
        <CardDescription>
          {formatBytes(data.usedBytes)} of {formatBytes(data.limitBytes)}
        </CardDescription>
        <CardAction>
          <span className="text-data text-sm" style={{ color: barColor }}>
            {percent.toFixed(0)}%
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${clamped}%`, backgroundColor: barColor }}
          />
        </div>

        <div className={cn("grid gap-3", spent ? "grid-cols-3" : "grid-cols-2")}>
          {spent ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">Spent</span>
              <span className="text-data text-[13px]">{spent}</span>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Projected</span>
            <span
              className="text-data text-[13px]"
              style={{ color: overBudget ? "var(--warning)" : undefined }}
            >
              {formatBytes(data.projectedBytes)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">Remaining</span>
            <span className="text-data text-[13px]">
              {formatBytes(remaining)}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Resets {formatDay(data.periodEnd)}
          {overBudget ? " · on pace to exceed" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
