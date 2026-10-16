import { Image } from "lucide-react";

type ScreenshotPlaceholderProps = {
  src?: string;
  alt: string;
};

export function ScreenshotPlaceholder({ src, alt }: ScreenshotPlaceholderProps) {
  return (
    <div className="mt-16 w-full overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      {src ? (
        <img src={src} alt={alt} className="w-full object-contain" />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-card/40 text-muted-foreground">
          <Image className="mb-1 size-7" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">App screenshot</p>
          <p className="text-xs">16:9 · 1600 × 900</p>
        </div>
      )}
    </div>
  );
}
