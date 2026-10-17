import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes, formatDayKeyShort, formatHour, splitBytes } from "@/lib/format";
import { api, type Wrapped, type WrappedPeriod } from "@/lib/ipc";

/** Exported image size: 4:5, the shape social timelines crop least. */
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const PERIODS: { value: WrappedPeriod; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** Card layouts drawn on the canvas. `poster` is the original. */
export type WrappedStyle = "poster" | "ledger" | "minimal";
const STYLES: { value: WrappedStyle; label: string }[] = [
  { value: "poster", label: "Poster" },
  { value: "ledger", label: "Ledger" },
  { value: "minimal", label: "Minimal" },
];

/** Day/Week/Month/Year switch plus a stepper back through earlier windows. */
export function PeriodPicker({
  period,
  offset,
  label,
  onChange,
}: {
  period: WrappedPeriod;
  offset: number;
  label: string;
  onChange: (period: WrappedPeriod, offset: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={period}
        onValueChange={(value) =>
          value && onChange(value as WrappedPeriod, 0)
        }
      >
        {PERIODS.map(({ value, label: text }) => (
          <ToggleGroupItem key={value} value={value} aria-label={`${text} recap`}>
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous period"
          onClick={() => onChange(period, offset + 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-data min-w-20 text-center text-sm">{label}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next period"
          disabled={offset <= 0}
          onClick={() => onChange(period, Math.max(offset - 1, 0))}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** The fixed poster palette, read once per draw. */
function palette() {
  return {
    sans: cssVar("--font-sans", "system-ui, sans-serif"),
    mono: cssVar("--font-mono", "monospace"),
    bg: cssVar("--wrapped-bg", "#141312"),
    soft: cssVar("--wrapped-bg-soft", "#262322"),
    ink: cssVar("--wrapped-ink", "#f6f3ed"),
    muted: cssVar("--wrapped-muted", "#a49d92"),
    copper: cssVar("--wrapped-copper", "#e2a26c"),
    sky: cssVar("--wrapped-sky", "#80b7d6"),
    sage: cssVar("--wrapped-sage", "#8ec6a8"),
    year: cssVar("--wrapped-year", "#2b2826"),
  };
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
  style: WrappedStyle,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const pad = 76;
  const available = W - 2 * pad;
  const c = palette();
  const font = (size: number, weight: number, family = c.sans) =>
    `${weight} ${size}px ${family}`;

  ctx.textBaseline = "middle";

  const text = (
    value: string,
    {
      x,
      y,
      size,
      weight,
      color,
      family,
      align = "left",
    }: {
      x: number;
      y: number;
      size: number;
      weight: number;
      color: string;
      family?: string;
      align?: CanvasTextAlign;
    },
  ) => {
    ctx.textAlign = align;
    ctx.font = font(size, weight, family);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };

  const panel = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    radius = 26,
  ) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  };

  const hairline = (y: number) => {
    ctx.strokeStyle = c.soft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
  };

  // Hero: one number, shrunk until value and unit fit across the card.
  const { value, unit } = splitBytes(data.total);
  const fitHero = (max: number) => {
    let size = max;
    for (const candidate of [max, 268, 236, 208, 180, 156, 132, 108]) {
      size = candidate;
      ctx.font = font(candidate, 700, c.mono);
      const valueWidth = ctx.measureText(value).width;
      ctx.font = font(Math.round(candidate * 0.386), 700, c.mono);
      if (valueWidth + 26 + ctx.measureText(unit).width <= available) break;
    }
    return size;
  };

  const hero = (
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = "left",
  ) => {
    const unitSize = Math.round(size * 0.386);
    ctx.font = font(size, 700, c.mono);
    const valueWidth = ctx.measureText(value).width;
    ctx.font = font(unitSize, 700, c.mono);
    const width = valueWidth + 26 + ctx.measureText(unit).width;
    const left =
      align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    text(value, {
      x: left,
      y,
      size,
      weight: 700,
      color: c.ink,
      family: c.mono,
    });
    text(unit, {
      x: left + valueWidth + 26,
      y: y + size * 0.13,
      size: unitSize,
      weight: 700,
      color: c.copper,
      family: c.mono,
    });
  };

  // Download versus upload as one bar.
  const splitBar = (y: number) => {
    const total = data.rx + data.tx;
    const rxW = total > 0 ? Math.max((data.rx / total) * available, 8) : available;
    text(`↓ ${formatBytes(data.rx)}`, {
      x: pad,
      y: y - 38,
      size: 28,
      weight: 500,
      color: c.sky,
      family: c.mono,
    });
    text(`${formatBytes(data.tx)} ↑`, {
      x: W - pad,
      y: y - 38,
      size: 28,
      weight: 500,
      color: c.copper,
      family: c.mono,
      align: "right",
    });
    panel(pad, y, available, 24, c.soft, 12);
    panel(pad, y, rxW, 24, c.sky, 12);
    panel(pad + rxW, y, Math.max(available - rxW, 8), 24, c.copper, 12);
  };

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

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.12;
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1150);
  wash.addColorStop(0, c.sage);
  wash.addColorStop(1, c.bg);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Year as background texture, cropped by the top-right corner.
  text(`${data.year}`, {
    x: W + 150,
    y: 150,
    size: 760,
    weight: 700,
    color: c.year,
    family: c.mono,
    align: "right",
  });

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
  text("DataPulse", { x: brandX, y: 108, size: 40, weight: 600, color: c.ink });
  text("WRAPPED", {
    x: W - pad,
    y: 110,
    size: 28,
    weight: 700,
    color: c.copper,
    align: "right",
  });

  if (style === "ledger") {
    // Receipt: one monospace row per figure, hairlines between.
    text(`${data.headline} you moved`, {
      x: pad,
      y: 250,
      size: 34,
      weight: 500,
      color: c.muted,
      family: c.mono,
    });
    hero(pad, 386, fitHero(236));

    const rows: [string, string][] = [
      ["Downloaded", formatBytes(data.rx)],
      ["Uploaded", formatBytes(data.tx)],
      ...stats.map(([label, value]) => [label, value] as [string, string]),
    ];
    const step = 112;
    rows.forEach(([label, value], index) => {
      const y = 560 + index * step;
      hairline(y);
      ctx.font = font(36, 700, c.mono);
      text(fitText(ctx, value, available * 0.55), {
        x: W - pad,
        y: y + step / 2,
        size: 36,
        weight: 700,
        color: index === 0 ? c.sky : index === 1 ? c.copper : c.ink,
        family: c.mono,
        align: "right",
      });
      text(label, {
        x: pad,
        y: y + step / 2,
        size: 30,
        weight: 500,
        color: c.muted,
      });
    });
  } else if (style === "minimal") {
    // Editorial: nothing but the number and one line of facts.
    text(`${data.headline} you moved`, {
      x: W / 2,
      y: 470,
      size: 40,
      weight: 500,
      color: c.muted,
      align: "center",
    });
    hero(W / 2, 640, fitHero(300), "center");
    splitBar(880);

    const facts = [
      stats[0][1] === "—" ? "" : `Busiest ${stats[0][1]}`,
      data.busiestHour === null ? "" : `Peak ${formatHour(data.busiestHour)}`,
      data.topInterface ? `Top link ${data.topInterface.name}` : "",
      `${data.activeDays} days online`,
    ].filter(Boolean);
    const half = Math.ceil(facts.length / 2);
    [facts.slice(0, half), facts.slice(half)].forEach((group, index) => {
      ctx.font = font(28, 500, c.mono);
      text(fitText(ctx, group.join("  ·  "), available), {
        x: W / 2,
        y: 1030 + index * 52,
        size: 28,
        weight: 500,
        color: c.muted,
        family: c.mono,
        align: "center",
      });
    });
  } else {
    text(`${data.headline} you moved`, {
      x: pad,
      y: 292,
      size: 44,
      weight: 500,
      color: c.muted,
    });
    hero(pad, 452, fitHero(300));
    splitBar(674);

    const cardW = (available - 24) / 2;
    stats.forEach(([label, value, sub], index) => {
      const x = pad + (index % 2) * (cardW + 24);
      const y = 770 + Math.floor(index / 2) * 204;
      panel(x, y, cardW, 180, c.soft);
      text(label, {
        x: x + 34,
        y: y + 52,
        size: 26,
        weight: 500,
        color: c.muted,
      });
      ctx.font = font(52, 700, c.mono);
      text(fitText(ctx, value, cardW - 68), {
        x: x + 34,
        y: y + 112,
        size: 52,
        weight: 700,
        color: c.ink,
        family: c.mono,
      });
      ctx.font = font(25, 400, c.sans);
      text(fitText(ctx, sub, cardW - 68), {
        x: x + 34,
        y: y + 152,
        size: 25,
        weight: 400,
        color: c.muted,
      });
    });
  }

  text("MEASURED LOCALLY ON THIS PC", {
    x: pad,
    y: 1258,
    size: 24,
    weight: 500,
    color: c.muted,
    family: c.mono,
  });
  text("datapulse", {
    x: W - pad,
    y: 1258,
    size: 24,
    weight: 500,
    color: c.copper,
    family: c.mono,
    align: "right",
  });
}

/** What the image says, for screen readers and for the canvas fallback. */
function wrappedLabel(data: Wrapped): string {
  return [
    `${data.headline} DataPulse recap.`,
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

export function WrappedDialog({
  open,
  onOpenChange,
  data,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Wrapped | null;
  loading: boolean;
  error: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [style, setStyle] = useState<WrappedStyle>("poster");

  useEffect(() => {
    const image = new Image();
    image.onload = () => setLogo(image);
    image.src = "/logo.png";
  }, []);

  // Layout effect, not effect: draw before the browser paints, so the canvas
  // never shows up blank.
  useLayoutEffect(() => {
    if (open && data && canvasRef.current) {
      drawWrapped(canvasRef.current, data, logo, style);
    }
  }, [open, data, logo, style]);

  const empty = data?.total === 0;
  const pending = loading || (!data && !error);
  const slug = `${data?.label ?? "card"}${style === "poster" ? "" : `-${style}`}`;

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
        const path = await api.saveWrappedPng(slug, bytes);
        toast.success(`datapulse-wrapped-${slug}.png saved`, {
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
          <DialogDescription>
            Any stretch of days as one shareable card.
          </DialogDescription>
        </DialogHeader>

        {error || (!pending && (!data || empty)) ? (
          <div className="flex aspect-4/5 flex-col items-center justify-center gap-2 rounded-xl bg-muted/40 p-6 text-center">
            <p className="text-sm font-medium">
              {error ?? `Nothing recorded in ${data?.label ?? ""}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {error
                ? "The recap could not be read from the local database."
                : "DataPulse only counts from the day it starts running, so the recap needs a little history first."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={style}
              aria-label="Card style"
              onValueChange={(value) => {
                if (value) setStyle(value as WrappedStyle);
              }}
            >
              {STYLES.map((item) => (
                <ToggleGroupItem key={item.value} value={item.value}>
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="relative">
              <canvas
                ref={canvasRef}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                role="img"
                aria-label={data ? wrappedLabel(data) : undefined}
                className="w-full rounded-xl ring-1 ring-foreground/10"
              />
              {pending ? (
                <div
                  role="status"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-muted/40 text-center"
                >
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Making your card…
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-end">
          <Button onClick={save} disabled={!data || empty}>
            <Download />
            Save PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
