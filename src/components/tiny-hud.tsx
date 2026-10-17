import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowDown, ArrowUp, X, type LucideIcon } from "lucide-react";
import { useEffect, type CSSProperties } from "react";

import { useLiveStats } from "@/hooks/use-live-stats";
import { formatBytes, formatRate } from "@/lib/format";
import { api } from "@/lib/ipc";

// Docking waits for the drag to settle; a pause mid-drag also counts, which
// only nudges the window near an edge and the drag carries on from there.
const SNAP_DELAY_MS = 400;
// Staggered so the bars of one meter never rise together.
const BAR_DELAYS = [0, 120, 55, 175];
// Quieter than this counts as idle; the bars stay, but short and slow.
const IDLE_BYTES = 1024;
const IDLE_LEVEL = 0.22;

/** Audio-style level meter: taller the busier a direction gets, easing between
 *  levels instead of snapping when traffic stops. */
function Equalizer({ rate, tone }: { rate: number; tone: string }) {
  const idle = rate < IDLE_BYTES;
  // Log scale, so 1 KB/s and 1 MB/s are far apart on screen.
  const level = idle ? IDLE_LEVEL : Math.min(1, Math.log10(rate) / 7.5);
  // One steady rhythm while there is traffic — the height carries the rate, and
  // a duration that changed with every sample made the bars twitch.
  const duration = idle ? 2600 : 640;

  return (
    <span
      aria-hidden="true"
      className={`flex h-3 w-4 shrink-0 origin-bottom items-end justify-between transition-transform duration-700 ease-out ${
        idle ? "opacity-60" : ""
      } ${tone}`}
      style={{ transform: `scaleY(${level})` }}
    >
      {BAR_DELAYS.map((delay) => (
        <span
          key={delay}
          className="tiny-bar h-full w-[3px] origin-bottom rounded-full bg-current motion-reduce:animate-none"
          style={
            {
              "--tiny-bar-duration": `${duration}ms`,
              "--tiny-bar-delay": `${delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

function RateRow({
  rate,
  icon: Icon,
  tone,
}: {
  rate: number;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <span className={`flex items-center gap-1.5 text-[11px] leading-none ${tone}`}>
      <Equalizer rate={rate} tone={tone} />
      <Icon className="size-3 shrink-0" />
      <span className="text-data whitespace-nowrap text-foreground">
        {formatRate(rate)}
      </span>
    </span>
  );
}

export function TinyHud() {
  const { latest } = useLiveStats();

  const rx = latest?.rxRate ?? 0;
  const tx = latest?.txRate ?? 0;
  const session = (latest?.sessionRx ?? 0) + (latest?.sessionTx ?? 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Hiding through the command keeps the saved choice in step, so the
      // Settings switch and the next launch agree with what is on screen.
      if (event.key === "Escape") void api.setTinyVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    let timer: number | undefined;

    getCurrentWindow()
      .onMoved(() => {
        // Dock once the drag settles; a move event per frame would re-place the
        // window under the pointer.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void api.snapTiny(), SNAP_DELAY_MS);
      })
      .then((dispose) => {
        if (active) {
          unlisten = dispose;
        } else {
          dispose();
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      role="group"
      aria-label="DataPulse tiny HUD"
      title="DataPulse — drag to a screen edge, double-click to open"
      onDoubleClick={() => void api.openMainWindow()}
      className="flex h-full w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-2.5 text-card-foreground"
    >
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col justify-center gap-1">
        <RateRow rate={rx} icon={ArrowDown} tone="text-download" />
        <RateRow rate={tx} icon={ArrowUp} tone="text-upload" />
      </div>

      <div className="pointer-events-none flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-data text-[11px] leading-none">
          {formatBytes(session)}
        </span>
        <span className="text-[9px] leading-none text-muted-foreground">
          session
        </span>
      </div>

      <button
        type="button"
        aria-label="Hide the tiny HUD"
        title="Hide (Esc)"
        onClick={() => void api.setTinyVisible(false)}
        onDoubleClick={(event) => event.stopPropagation()}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
