import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/** Flat baseline with one spike: the travelling pulse rides along it. */
const PULSE_PATH = "M0 16H70l7-11 7 22 7-11h109";

export function SplashScreen() {
  const [version, setVersion] = useState("");
  const [fading, setFading] = useState(false);

  useEffect(() => {
    api.appMeta()
      .then((meta) => setVersion(meta.version))
      .catch(() => {});

    let active = true;
    let unlisten: (() => void) | undefined;
    listen("splash-fade", () => setFading(true)).then((dispose) => {
      if (active) unlisten = dispose;
      else dispose();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-background transition-opacity duration-200",
        fading && "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={() => void getCurrentWindow().close()}
        aria-label="Quit DataPulse"
        title="Quit DataPulse"
        className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>

      <div className="flex flex-col items-center gap-4 animate-splash-in">
        <img
          src="/logo.png"
          alt=""
          draggable={false}
          className="size-14 rounded-xl border border-border/60"
        />
        <span className="font-heading text-sm font-semibold tracking-tight">
          DataPulse
        </span>
        <svg
          viewBox="0 0 200 32"
          aria-hidden="true"
          className="h-7 w-44 overflow-visible"
        >
          <path
            d={PULSE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground/30"
          />
          <path
            d={PULSE_PATH}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary animate-pulse-trace"
          />
        </svg>
      </div>

      <span className="absolute inset-x-0 bottom-4 text-center text-data text-[11px] text-muted-foreground/70">
        {version ? `v${version}` : ""}
      </span>
    </div>
  );
}
