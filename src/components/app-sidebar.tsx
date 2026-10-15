import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChartColumn,
  Gauge,
  Network,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";

import { useLiveStats } from "@/hooks/use-live-stats";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ViewId = "dashboard" | "usage" | "interfaces" | "settings";

const NAV: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Overview", icon: Gauge },
  { id: "usage", label: "Usage", icon: ChartColumn },
  { id: "interfaces", label: "Interfaces", icon: Network },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

type AppSidebarProps = {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
};

export function AppSidebar({ view, onNavigate }: AppSidebarProps) {
  const { latest } = useLiveStats();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="size-4" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-heading text-sm font-semibold tracking-tight">
            DataPulse
          </span>
          <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Network monitor
          </span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1.5">
        {NAV.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border/70 px-3 py-3">
        <p className="px-0.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          This session
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="rounded-md bg-sidebar-accent/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ArrowDown className="size-3 text-download" />
              Down
            </div>
            <div className="text-data mt-0.5 text-[13px] text-foreground">
              {formatBytes(latest?.sessionRx ?? 0)}
            </div>
          </div>
          <div className="rounded-md bg-sidebar-accent/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ArrowUp className="size-3 text-upload" />
              Up
            </div>
            <div className="text-data mt-0.5 text-[13px] text-foreground">
              {formatBytes(latest?.sessionTx ?? 0)}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
