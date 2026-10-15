import type { LivePoint } from "@/hooks/use-live-stats";
import { cn } from "@/lib/utils";

type LiveSparklineProps = {
  data: LivePoint[];
  className?: string;
};

const WIDTH = 100;
const HEIGHT = 32;
const FLOOR = 1024;

export function LiveSparkline({ data, className }: LiveSparklineProps) {
  const points = data.length > 1 ? data : [...data, ...data];
  const peak = Math.max(FLOOR, ...points.map((p) => Math.max(p.rx, p.tx)));
  const stepX = WIDTH / (points.length - 1);

  const line = (pick: (point: LivePoint) => number) =>
    points
      .map((point, index) => {
        const x = (index * stepX).toFixed(2);
        const y = (HEIGHT - (pick(point) / peak) * HEIGHT).toFixed(2);
        return `${index === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  const area = (pick: (point: LivePoint) => number) =>
    `${line(pick)} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-20 w-full", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-rx" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: "var(--download)", stopOpacity: 0.28 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "var(--download)", stopOpacity: 0.02 }}
          />
        </linearGradient>
        <linearGradient id="spark-tx" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: "var(--upload)", stopOpacity: 0.22 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "var(--upload)", stopOpacity: 0.02 }}
          />
        </linearGradient>
      </defs>

      <path d={area((p) => p.rx)} fill="url(#spark-rx)" />
      <path
        d={line((p) => p.rx)}
        fill="none"
        stroke="var(--download)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area((p) => p.tx)} fill="url(#spark-tx)" />
      <path
        d={line((p) => p.tx)}
        fill="none"
        stroke="var(--upload)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
