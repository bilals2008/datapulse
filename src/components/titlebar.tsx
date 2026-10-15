import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type TitleBarProps = {
  collapsed: boolean;
  onToggleSidebar: () => void;
};

export function TitleBar({ collapsed, onToggleSidebar }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let active = true;
    let unlisten: (() => void) | undefined;

    const sync = () => {
      appWindow
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {});
    };

    sync();
    appWindow.onResized(sync).then((dispose) => {
      if (active) {
        unlisten = dispose;
      } else {
        dispose();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const controls = [
    {
      label: "Minimize",
      icon: Minus,
      danger: false,
      onClick: () => void getCurrentWindow().minimize(),
    },
    {
      label: maximized ? "Restore" : "Maximize",
      icon: maximized ? Copy : Square,
      danger: false,
      onClick: () => void getCurrentWindow().toggleMaximize(),
    },
    {
      label: "Close",
      icon: X,
      danger: true,
      onClick: () => void getCurrentWindow().close(),
    },
  ];

  return (
    <header className="flex h-9 shrink-0 items-center border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div
        data-tauri-drag-region
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5"
      >
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/60"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>

        <span data-tauri-drag-region className="flex items-center gap-2 px-1.5">
          <img
            src="/logo.png"
            alt=""
            draggable={false}
            className="size-5 rounded-[5px]"
          />
          <span className="font-heading text-xs font-semibold tracking-tight">
            DataPulse
          </span>
        </span>
      </div>

      <div className="flex h-full shrink-0 items-stretch">
        {controls.map((control) => (
          <button
            key={control.label}
            type="button"
            onClick={control.onClick}
            aria-label={control.label}
            title={control.label}
            className={cn(
              "flex w-11 items-center justify-center text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring/60",
              control.danger
                ? "hover:bg-destructive hover:text-white"
                : "hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <control.icon className="size-3.5" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </header>
  );
}
