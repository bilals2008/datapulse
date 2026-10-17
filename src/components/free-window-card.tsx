import { MoonStar } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes, formatHour, formatHourRange } from "@/lib/format";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

export function FreeWindowCard() {
  const { data } = usePoll(api.freeWindow, 60000);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quiet hours</CardTitle>
          <CardDescription>When the link is least busy</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const peak = Math.max(...data.hours.map((hour) => hour.bytes), 1);
  const inWindow = (hour: number) => {
    const span = (data.endHour - data.startHour + 24) % 24;
    return (hour - data.startHour + 24) % 24 < span;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiet hours</CardTitle>
        <CardDescription>
          Least busy stretch of the day, averaged over two weeks
        </CardDescription>
        <CardAction>
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <MoonStar className="size-3.5" />
            {formatHourRange(data.startHour, data.endHour)}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-data text-3xl leading-none font-medium tracking-tight">
            {formatBytes(data.windowBytes)}
          </span>
          <span className="text-xs text-muted-foreground">
            per hour in that window · {formatBytes(data.dayBytes)} on average
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="flex h-20 items-end gap-[2px]" aria-hidden="true">
            {data.hours.map((hour, index) => (
              <Tooltip key={hour.hour}>
                <TooltipTrigger asChild>
                  <div className="flex h-full min-w-3 flex-1 items-end">
                    <div
                      style={{
                        height: `${Math.max((hour.bytes / peak) * 100, 2)}%`,
                        animationDelay: `${index * 12}ms`,
                      }}
                      className={cn(
                        "animate-bar-grow w-full rounded-[2px]",
                        inWindow(hour.hour) ? "bg-primary" : "bg-muted-foreground/25",
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {formatHour(hour.hour)} · {formatBytes(hour.bytes)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{data.advice}</p>
      </CardContent>
    </Card>
  );
}
