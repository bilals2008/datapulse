import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppSidebar, type ViewId } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { TitleBar } from "@/components/titlebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveStatsProvider, useLiveStats } from "@/hooks/use-live-stats";
import { SettingsProvider } from "@/hooks/use-settings";
import { formatRate, isActiveRate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DashboardView } from "@/pages/dashboard";
import { InterfacesView } from "@/pages/interfaces";
import { SettingsView } from "@/pages/settings";
import { UsageView } from "@/pages/usage";

const TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Overview",
    subtitle: "Live throughput and today's usage",
  },
  usage: { title: "Usage", subtitle: "Historical transfer volume" },
  interfaces: { title: "Interfaces", subtitle: "Network adapters on this device" },
  settings: { title: "Settings", subtitle: "Preferences and local data" },
};

const SHORTCUTS: Record<string, ViewId> = {
  "1": "dashboard",
  "2": "usage",
  "3": "interfaces",
  "4": "settings",
};

function HeaderStats() {
  const { latest } = useLiveStats();
  const rx = latest?.rxRate ?? 0;
  const tx = latest?.txRate ?? 0;
  const active = isActiveRate(rx + tx);

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-xs">
        <ArrowDown className="size-3 text-download" />
        <span className="text-data">{formatRate(rx)}</span>
      </span>
      <span className="flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2 py-1 text-xs">
        <ArrowUp className="size-3 text-upload" />
        <span className="text-data">{formatRate(tx)}</span>
      </span>
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-success" : "bg-muted-foreground/40",
        )}
        aria-hidden="true"
      />
    </div>
  );
}

const SIDEBAR_KEY = "sidebar";

function App() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "collapsed",
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      const target = SHORTCUTS[event.key];
      if (target) {
        event.preventDefault();
        setView(target);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  return (
    <SettingsProvider>
      <LiveStatsProvider>
        <TooltipProvider delayDuration={400}>
          <div className="flex h-full flex-col">
            <TitleBar collapsed={collapsed} onToggleSidebar={toggleSidebar} />

            <div className="flex min-h-0 flex-1">
              <AppSidebar
                view={view}
                onNavigate={setView}
                collapsed={collapsed}
              />

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-6">
                  <div className="flex flex-col">
                    <h1 className="font-heading text-sm font-semibold">
                      {TITLES[view].title}
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      {TITLES[view].subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <HeaderStats />
                    <ThemeToggle />
                  </div>
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {view === "dashboard" ? (
                    <DashboardView onOpenSettings={() => setView("settings")} />
                  ) : null}
                  {view === "usage" ? <UsageView /> : null}
                  {view === "interfaces" ? <InterfacesView /> : null}
                  {view === "settings" ? <SettingsView /> : null}
                </main>
              </div>
            </div>
          </div>

          <Toaster position="bottom-right" />
        </TooltipProvider>
      </LiveStatsProvider>
    </SettingsProvider>
  );
}

export default App;
