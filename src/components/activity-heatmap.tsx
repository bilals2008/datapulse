import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes, formatDayKey, formatDayKeyShort } from "@/lib/format";
import { api, type DailyTotal } from "@/lib/ipc";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };
const DAYS = 364;

const LEVELS = [
  "color-mix(in oklab, var(--foreground) 8%, transparent)",
  "color-mix(in oklab, var(--primary) 24%, var(--card))",
  "color-mix(in oklab, var(--primary) 46%, var(--card))",
  "color-mix(in oklab, var(--primary) 68%, var(--card))",
  "var(--primary)",
];

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function levelOf(total: number, max: number): number {
  if (total <= 0) return 0;
  const ratio = max > 0 ? total / max : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function ActivityHeatmap() {
  const { data } = usePoll(() => api.dailyActivity(DAYS), 60000);
  const [selected, setSelected] = useState<string | null>(null);

  const model = useMemo(() => {
    if (!data || data.length === 0) return null;

    const pad = parseDay(data[0].day).getDay();
    const cells: (DailyTotal | null)[] = [
      ...Array.from({ length: pad }, () => null),
      ...data,
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (DailyTotal | null)[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    const monthMarks = weeks.map((week, weekIndex) => {
      const first = week.find((cell): cell is DailyTotal => cell !== null);
      if (!first) return "";
      const month = Number(first.day.slice(5, 7));
      const previous =
        weekIndex > 0
          ? weeks[weekIndex - 1].find((cell): cell is DailyTotal => cell !== null)
          : null;
      const previousMonth = previous ? Number(previous.day.slice(5, 7)) : null;
      return month !== previousMonth ? MONTHS[month - 1] : "";
    });

    const max = data.reduce((value, day) => Math.max(value, day.rx + day.tx), 0);
    const total = data.reduce((value, day) => value + day.rx + day.tx, 0);
    const busiest = data.reduce<DailyTotal | null>((best, day) => {
      const bytes = day.rx + day.tx;
      return !best || bytes > best.rx + best.tx ? day : best;
    }, null);

    return { weeks, monthMarks, max, total, busiest };
  }, [data]);

  const selectedDay =
    selected && data ? data.find((day) => day.day === selected) ?? null : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity calendar</CardTitle>
        <CardDescription>
          Daily transfer over the last 12 months
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {model === null ? (
          <Skeleton className="h-28 w-full" />
        ) : model.total === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No activity recorded yet — the calendar fills in as data arrives.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-[3px]">
              <div className="flex w-7 shrink-0 flex-col justify-end gap-[3px] text-[10px] text-muted-foreground">
                {Array.from({ length: 7 }, (_, row) => (
                  <span
                    key={row}
                    className="h-[11px] leading-[11px]"
                    aria-hidden="true"
                  >
                    {WEEKDAY_LABELS[row] ?? ""}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex gap-[3px] text-[10px] text-muted-foreground">
                  {model.monthMarks.map((mark, index) => (
                    <span key={index} className="w-[11px] leading-[11px] whitespace-nowrap">
                      {mark}
                    </span>
                  ))}
                </div>

                <div className="flex gap-[3px]">
                  {model.weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-[3px]">
                      {week.map((cell, dayIndex) => {
                        if (!cell) {
                          return (
                            <span
                              key={dayIndex}
                              className="size-[11px]"
                              aria-hidden="true"
                            />
                          );
                        }

                        const bytes = cell.rx + cell.tx;
                        return (
                          <button
                            key={cell.day}
                            type="button"
                            onMouseEnter={() => setSelected(cell.day)}
                            onFocus={() => setSelected(cell.day)}
                            aria-label={`${formatDayKey(cell.day)}: ${formatBytes(bytes)}`}
                            className="size-[11px] rounded-[2px] outline-none transition-[box-shadow] hover:ring-1 hover:ring-foreground/40 focus-visible:ring-1 focus-visible:ring-ring"
                            style={{ backgroundColor: LEVELS[levelOf(bytes, model.max)] }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {model && model.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              {selectedDay ? (
                <>
                  {formatDayKey(selectedDay.day)} ·{" "}
                  <span className="text-data text-foreground">
                    {formatBytes(selectedDay.rx + selectedDay.tx)}
                  </span>{" "}
                  · ↓{formatBytes(selectedDay.rx)} ↑{formatBytes(selectedDay.tx)}
                </>
              ) : (
                <>
                  Total{" "}
                  <span className="text-data text-foreground">
                    {formatBytes(model.total)}
                  </span>{" "}
                  this year
                  {model.busiest ? (
                    <>
                      {" "}
                      · busiest{" "}
                      <span className="text-foreground">
                        {formatDayKeyShort(model.busiest.day)}
                      </span>{" "}
                      ({formatBytes(model.busiest.rx + model.busiest.tx)})
                    </>
                  ) : null}
                </>
              )}
            </p>

            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              Less
              {LEVELS.map((color, index) => (
                <span
                  key={index}
                  className="size-[11px] rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
              ))}
              More
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
