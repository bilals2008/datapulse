import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePoll } from "@/hooks/use-poll";
import { formatBytes, formatDayKeyShort, formatHour, splitBytes } from "@/lib/format";
import { api, type Wrapped } from "@/lib/ipc";

/** Exported image size: 4:5, the shape social timelines crop least. */
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const EARLIEST_YEAR = 2000;

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function drawWrapped(
  canvas: HTMLCanvasElement,
  data: Wrapped,
  logo: HTMLImageElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const pad = 76;
  const sans = cssVar("--font-sans", "system-ui, sans-serif");
  const mono = cssVar("--font-mono", "monospace");
  const bg = cssVar("--wrapped-bg", "#141312");
  const soft = cssVar("--wrapped-bg-soft", "#262322");
  const ink = cssVar("--wrapped-ink", "#f6f3ed");
  const muted = cssVar("--wrapped-muted", "#a49d92");
  const copper = cssVar("--wrapped-copper", "#e2a26c");
  const sky = cssVar("--wrapped-sky", "#80b7d6");
  const font = (size: number, weight: number, family = sans) =>
    `${weight} ${size}px ${family}`;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.12;
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1150);
  wash.addColorStop(0, cssVar("--wrapped-sage", "#8ec6a8"));
  wash.addColorStop(1, bg);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Year as background texture, cropped by the top-right corner.
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.font = font(760, 700, mono);
  ctx.fillStyle = cssVar("--wrapped-year", "#2b2826");
  ctx.fillText(`${data.year}`, W + 150, 150);

  let brandX = pad;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(brandX, 78, 60, 60, 15);
    ctx.clip();
    ctx.drawImage(logo, brandX, 78, 60, 60);
    ctx.restore();
    brandX += 78;
  }
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = font(40, 600);
  ctx.fillText("DataPulse", brandX, 108);

  ctx.textAlign = "right";
  ctx.fillStyle = copper;
  ctx.font = font(28, 700);
  ctx.fillText("WRAPPED", W - pad, 110);

  // Hero: one number, as large as it fits across the card.
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = font(44, 500);
  ctx.fillText(`In ${data.year} you moved`, pad, 292);

  const { value, unit } = splitBytes(data.total);
  const heroY = 452;
  const available = W - 2 * pad;
  let size = 300;
  for (const candidate of [300, 268, 236, 208, 180, 156, 132]) {
    size = candidate;
    ctx.font = font(candidate, 700, mono);
    const valueWidth = ctx.measureText(value).width;
    ctx.font = font(Math.round(candidate * 0.386), 700, mono);
    if (valueWidth + 26 + ctx.measureText(unit).width <= available) break;
  }

  ctx.fillStyle = ink;
  ctx.font = font(size, 700, mono);
  ctx.fillText(value, pad, heroY);
  const valueEnd = pad + ctx.measureText(value).width;
  ctx.fillStyle = copper;
  ctx.font = font(Math.round(size * 0.386), 700, mono);
  ctx.fillText(unit, valueEnd + 26, heroY + size * 0.13);

  // Download versus upload as one bar.
  const barY = 674;
  const barW = W - 2 * pad;
  const total = data.rx + data.tx;
  const rxW = total > 0 ? Math.max((data.rx / total) * barW, 8) : barW;

  ctx.font = font(28, 500, mono);
  ctx.fillStyle = sky;
  ctx.fillText(`↓ ${formatBytes(data.rx)}`, pad, 636);
  ctx.textAlign = "right";
  ctx.fillStyle = copper;
  ctx.fillText(`${formatBytes(data.tx)} ↑`, W - pad, 636);

  ctx.fillStyle = soft;
  ctx.beginPath();
  ctx.roundRect(pad, barY, barW, 24, 12);
  ctx.fill();
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.roundRect(pad, barY, rxW, 24, 12);
  ctx.fill();
  ctx.fillStyle = copper;
  ctx.beginPath();
  ctx.roundRect(pad + rxW, barY, Math.max(barW - rxW, 8), 24, 12);
  ctx.fill();

  const stats: [string, string, string][] = [
    [
      "Busiest day",
      data.busiestDay ? formatDayKeyShort(data.busiestDay.day) : "—",
      data.busiestDay ? `${formatBytes(data.busiestDay.bytes)} in one day` : "",
    ],
    [
      "Peak hour",
      data.busiestHour === null ? "—" : formatHour(data.busiestHour),
      "your busiest hour",
    ],
    ["Top link", data.topInterface?.name ?? "—", "carried most of it"],
    ["Days active", `${data.activeDays}`, "days online"],
  ];

  const cardW = (available - 24) / 2;
  stats.forEach(([label, value, sub], index) => {
    const x = pad + (index % 2) * (cardW + 24);
    const y = 770 + Math.floor(index / 2) * 204;

    ctx.fillStyle = soft;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, 180, 26);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = muted;
    ctx.font = font(26, 500);
    ctx.fillText(label, x + 34, y + 52);

    ctx.fillStyle = ink;
    ctx.font = font(52, 700, mono);
    ctx.fillText(fitText(ctx, value, cardW - 68), x + 34, y + 112);

    ctx.fillStyle = muted;
    ctx.font = font(25, 400);
    ctx.fillText(fitText(ctx, sub, cardW - 68), x + 34, y + 152);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = font(24, 500, mono);
  ctx.fillText("MEASURED LOCALLY ON THIS PC", pad, 1258);
  ctx.textAlign = "right";
  ctx.fillStyle = copper;
  ctx.fillText("datapulse", W - pad, 1258);
  ctx.textAlign = "left";
}

/** What the image says, for screen readers and for the canvas fallback. */
function wrappedLabel(data: Wrapped): string {
  return [
    `${data.year} DataPulse recap.`,
    `${formatBytes(data.total)} moved in total`,
    `(${formatBytes(data.rx)} downloaded, ${formatBytes(data.tx)} uploaded).`,
    data.busiestDay
      ? `Busiest day ${formatDayKeyShort(data.busiestDay.day)}.`
      : "",
    data.busiestHour === null
      ? ""
      : `Peak hour ${formatHour(data.busiestHour)}.`,
    data.topInterface ? `Top link ${data.topInterface.name}.` : "",
    `${data.activeDays} active days.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function YearPicker({
  year,
  max,
  onChange,
}: {
  year: number;
  max: number;
  onChange: (year: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous year"
        disabled={year <= EARLIEST_YEAR}
        onClick={() => onChange(year - 1)}
      >
        <ChevronLeft />
      </Button>
      <span className="text-data w-11 text-center text-sm">{year}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next year"
        disabled={year >= max}
        onClick={() => onChange(year + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function WrappedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const { data } = usePoll(() => api.wrapped(year), 60000, [year]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setLogo(image);
    image.src = "/logo.png";
  }, []);

  useEffect(() => {
    if (data && canvasRef.current) drawWrapped(canvasRef.current, data, logo);
  }, [data, logo]);

  const empty = !data || data.total === 0;

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error("Could not encode the image.");
        return;
      }
      try {
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        const path = await api.saveWrappedPng(year, bytes);
        toast.success(`datapulse-wrapped-${year}.png saved`, {
          description: path,
        });
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      }
    }, "image/png");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[27rem]">
        <DialogHeader>
          <DialogTitle>DataPulse Wrapped</DialogTitle>
          <DialogDescription>Your year as one shareable card.</DialogDescription>
        </DialogHeader>

        {empty ? (
          <div className="flex aspect-4/5 flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 p-6 text-center">
            <p className="text-sm font-medium">
              {data ? `Nothing recorded in ${year}` : "Reading your year…"}
            </p>
            <p className="text-xs text-muted-foreground">
              {data
                ? "DataPulse only counts from the day it starts running, so the recap needs a little history first."
                : ""}
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            role="img"
            aria-label={wrappedLabel(data)}
            className="w-full rounded-xl ring-1 ring-foreground/10"
          />
        )}

        <DialogFooter className="sm:justify-between">
          <YearPicker year={year} max={thisYear} onChange={setYear} />
          <Button onClick={save} disabled={empty}>
            <Download />
            Save PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
