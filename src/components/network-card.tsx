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
import { formatMBps } from "@/lib/format";
import { api, type WifiInfo } from "@/lib/ipc";
import { cn } from "@/lib/utils";

type Health = {
  label: string;
  dot: string;
  hint: string;
};

const LEGACY_RADIOS = new Set([
  "802.11a",
  "802.11b",
  "802.11g",
  "802.11n",
]);

function assess(wifi: WifiInfo): Health {
  const signal = wifi.signalPercent;
  const channel = Number(wifi.channel);
  const on2_4ghz = Number.isFinite(channel) && channel >= 1 && channel <= 14;
  const legacy = LEGACY_RADIOS.has(wifi.radioType.trim().toLowerCase());

  if (signal >= 70) {
    return {
      label: "Strong",
      dot: "bg-success",
      hint: legacy
        ? "Legacy radio — a Wi-Fi 5/6 adapter would raise your ceiling."
        : on2_4ghz
          ? "Solid link, but 2.4 GHz is congested — prefer 5 GHz."
          : "Signal and radio both look healthy.",
    };
  }

  if (signal >= 45) {
    return {
      label: "Fair",
      dot: "bg-warning",
      hint: on2_4ghz
        ? "2.4 GHz band is busy — a 5 GHz network would be more reliable."
        : "Move closer to the router or reduce obstacles.",
    };
  }

  return {
    label: "Weak",
    dot: "bg-destructive",
    hint: "Poor signal — expect slowdowns. Move closer to the router.",
  };
}

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
  const health = wifi ? assess(wifi) : null;

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
              <InfoField label="Link down" value={formatMBps(wifi.rxMbps)} />
              <InfoField label="Link up" value={formatMBps(wifi.txMbps)} />
            </div>
            <div className="flex items-start gap-2 border-t border-border/60 pt-3">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  health?.dot,
                )}
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground [text-wrap:pretty]">
                <span className="font-medium text-foreground">
                  {health?.label} signal.
                </span>{" "}
                {health?.hint}
              </p>
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
