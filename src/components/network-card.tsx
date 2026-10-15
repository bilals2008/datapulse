import { Wifi } from "lucide-react";

import { InfoField } from "@/components/info-field";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePoll } from "@/hooks/use-poll";
import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

function SignalBars({ percent }: { percent: number }) {
  const active = Math.max(1, Math.ceil(percent / 25));
  const color =
    percent >= 70
      ? "var(--success)"
      : percent >= 40
        ? "var(--warning)"
        : "var(--destructive)";

  return (
    <span className="flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          className="w-[3px] rounded-full bg-muted-foreground/30"
          style={{
            height: `${6 + index * 3}px`,
            backgroundColor: index < active ? color : undefined,
          }}
        />
      ))}
    </span>
  );
}

export function NetworkCard() {
  const { data: wifi } = usePoll(api.wifiInfo, 15000);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Wireless</CardTitle>
        {wifi ? (
          <CardAction>
            <SignalBars percent={wifi.signalPercent} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {wifi ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-heading truncate text-base font-medium">
                {wifi.ssid}
              </span>
              <span className="text-data text-sm text-muted-foreground">
                {wifi.signalPercent}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Radio" value={wifi.radioType || "—"} />
              <InfoField label="Channel" value={wifi.channel || "—"} />
              <InfoField label="Link down" value={`${wifi.rxMbps} Mbps`} />
              <InfoField label="Link up" value={`${wifi.txMbps} Mbps`} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <Wifi className={cn("size-4")} />
            No wireless connection detected.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
