import {
  ArrowDown,
  ArrowUp,
  ChartColumn,
  Gauge,
  Network,
  Settings as SettingsIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLiveStats } from "@/hooks/use-live-stats";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ViewId = "dashboard" | "usage" | "insights" | "interfaces" | "settings";

const NAV: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Overview", icon: Gauge },
  { id: "usage", label: "Usage", icon: ChartColumn },
  { id: "insights", label: "Insights", icon: Sparkles },
  { id: "interfaces", label: "Interfaces", icon: Network },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

type AppSidebarProps = {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
};

export function AppSidebar({ view, onNavigate, collapsed }: AppSidebarProps) {
  const { latest } = useLiveStats();
  const sessionRx = formatBytes(latest?.sessionRx ?? 0).replace(" ", "");
  const sessionTx = formatBytes(latest?.sessionTx ?? 0).replace(" ", "");

  const [railReady, setRailReady] = useState(false);

  useEffect(() => {
    if (!collapsed) {
      setRailReady(false);
      return;
    }

    const id = window.setTimeout(() => setRailReady(true), 260);
    return () => window.clearTimeout(id);
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {NAV.map((item) => {
          const active = view === item.id;

          return (
            <Tooltip key={`${item.id}-${collapsed ? "rail" : "full"}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={cn(
                    "flex h-8 items-center rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
                    collapsed ? "w-full justify-center" : "gap-2.5 px-2.5",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {collapsed ? null : item.label}
                </button>
              </TooltipTrigger>
              {collapsed && railReady ? (
                <TooltipContent side="right">{item.label}</TooltipContent>
              ) : null}
            </Tooltip>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto border-t border-sidebar-border/70",
          collapsed ? "px-2 py-3" : "px-3 py-3",
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2.5">
            <div
              className="flex flex-col items-center"
              title={`Downloaded this session: ${sessionRx}`}
            >
              <ArrowDown className="size-3 text-download" />
              <span className="text-data text-[10px] text-foreground">
                {sessionRx}
              </span>
            </div>
            <div
              className="flex flex-col items-center"
              title={`Uploaded this session: ${sessionTx}`}
            >
              <ArrowUp className="size-3 text-upload" />
              <span className="text-data text-[10px] text-foreground">
                {sessionTx}
              </span>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
