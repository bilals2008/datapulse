import { ShieldAlert } from "lucide-react";
import { useState } from "react";

import { InfoField } from "@/components/info-field";
import { UsageChart } from "@/components/usage-chart";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes } from "@/lib/format";
import { api, type AppUsage, type UsageRange } from "@/lib/ipc";
import { cn } from "@/lib/utils";

const RANGES: { id: UsageRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

function AppIcon({ app }: { app: AppUsage }) {
  if (!app.icon) {
    return (
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground"
      >
        {app.name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={app.icon}
      alt=""
      aria-hidden="true"
      className="size-7 shrink-0 rounded-md"
    />
  );
}

export function AppsView() {
  const [range, setRange] = useState<UsageRange>("7d");
  const [selected, setSelected] = useState<string | null>(null);
  const { data: report } = usePoll(() => api.appUsage(range), 20000, [range]);
  const { data: series } = usePoll(
    () => (selected ? api.appSeries(selected, "today") : Promise.resolve(null)),
    20000,
    [selected],
  );

  const apps = report?.apps ?? [];
  const total = (report?.rx ?? 0) + (report?.tx ?? 0);
  const chosen = apps.find((app) => app.key === selected);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          onValueChange={(value) => {
            if (value) setRange(value as UsageRange);
          }}
        >
          {RANGES.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="flex items-center gap-6">
          <InfoField label="Download" value={formatBytes(report?.rx ?? 0)} />
          <InfoField label="Upload" value={formatBytes(report?.tx ?? 0)} />
          <InfoField label="Applications" value={String(apps.length)} />
        </div>
      </div>

      {report && !report.tracked ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning" />
              Per-app tracking is off
            </CardTitle>
            <CardDescription>
              Windows only hands out per-application traffic through Event
              Tracing for Windows, and it refuses a session from an
              unelevated process. Restart DataPulse as administrator to record
              which app used the data; everything else on this page keeps
              working without it.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>By application</CardTitle>
          <CardDescription>
            Traffic attributed to each program, biggest first
          </CardDescription>
          {report?.tracked ? (
            <CardAction className="text-data text-xs text-muted-foreground">
              {report.packets.toLocaleString()} packets ·{" "}
              {report.attributed.toLocaleString()} attributed
              {report.orphans > 0
                ? ` · ${report.orphans.toLocaleString()} unowned`
                : ""}
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {apps.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                  <TableHead className="text-right">Upload</TableHead>
                  <TableHead className="w-40">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => {
                  const bytes = app.rx + app.tx;
                  const share = total > 0 ? (bytes / total) * 100 : 0;
                  const active = app.key === selected;

                  return (
                    <TableRow
                      key={app.key}
                      onClick={() => setSelected(active ? null : app.key)}
                      className={cn(
                        "cursor-pointer",
                        active && "bg-muted/60",
                      )}
                    >
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <AppIcon app={app} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {app.name}
                            </span>
                            {app.path ? (
                              <span
                                title={app.path}
                                className="block truncate text-[11px] text-muted-foreground"
                              >
                                {app.path}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-data text-right">
                        {formatBytes(app.rx)}
                      </TableCell>
                      <TableCell className="text-data text-right">
                        {formatBytes(app.tx)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-download"
                              style={{ width: `${Math.min(100, share)}%` }}
                            />
                          </span>
                          <span className="text-data w-12 text-right text-xs text-muted-foreground">
                            {share.toFixed(1)}%
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : report ? (
            <p className="text-sm text-muted-foreground">
              Nothing attributed yet. Keep DataPulse running for a moment while
              you browse or download something.
            </p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </CardContent>
      </Card>

      {chosen ? (
        <Card>
          <CardHeader>
            <CardTitle>{chosen.name} today</CardTitle>
            <CardDescription>
              Hourly download and upload for this application
            </CardDescription>
            <CardAction className="flex items-center gap-4">
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
          <CardContent>
            {series ? (
              <UsageChart
                buckets={series.buckets}
                range="today"
                className="h-56"
              />
            ) : (
              <Skeleton className="h-56 w-full" />
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
