import { Cable, Wifi } from "lucide-react";
import { useState } from "react";

import { InfoField } from "@/components/info-field";
import { UsageChart } from "@/components/usage-chart";
import { Badge } from "@/components/ui/badge";
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
import { api, type UsageRange } from "@/lib/ipc";

const RANGES: { id: UsageRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "12m", label: "12 months" },
];

const DAYS: Record<UsageRange, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "12m": 365,
};

export function UsageView() {
  const [range, setRange] = useState<UsageRange>("7d");
  const { data: series } = usePoll(() => api.usageSeries(range), 20000, [range]);
  const { data: interfaces } = usePoll(
    () => api.interfaceTotals(DAYS[range]),
    20000,
    [range],
  );

  const rx = series?.rx ?? 0;
  const tx = series?.tx ?? 0;
  const total = rx + tx;
  const dailyAverage = total / DAYS[range];

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
          <InfoField label="Download" value={formatBytes(rx)} />
          <InfoField label="Upload" value={formatBytes(tx)} />
          <InfoField label="Daily average" value={formatBytes(dailyAverage)} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer</CardTitle>
          <CardDescription>
            Download and upload volume over the selected range
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
              range={range}
              className="h-72"
            />
          ) : (
            <Skeleton className="h-72 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By interface</CardTitle>
          <CardDescription>
            Usage attributed to each network adapter
          </CardDescription>
        </CardHeader>
        <CardContent>
          {interfaces && interfaces.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interface</TableHead>
                  <TableHead className="text-right">Download</TableHead>
                  <TableHead className="text-right">Upload</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {item.isWireless ? (
                          <Wifi className="size-3.5 text-muted-foreground" />
                        ) : (
                          <Cable className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="font-medium">{item.name}</span>
                        {item.isWireless ? (
                          <Badge variant="secondary">Wi-Fi</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-data text-right">
                      {formatBytes(item.rx)}
                    </TableCell>
                    <TableCell className="text-data text-right">
                      {formatBytes(item.tx)}
                    </TableCell>
                    <TableCell className="text-data text-right">
                      {formatBytes(item.rx + item.tx)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No usage recorded for this range yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
