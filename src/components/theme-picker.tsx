import { Check } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { THEME_GROUPS, type Theme, type ThemeOption } from "@/lib/themes";
import { cn } from "@/lib/utils";

const PREVIEW_BARS = [10, 16, 8, 13, 11];

/** A miniature of the app chrome, coloured by the theme it stands for. */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div
      aria-hidden
      data-theme={theme}
      className="flex h-[68px] flex-col overflow-hidden rounded-md border border-border bg-background"
    >
      <div className="flex h-3.5 shrink-0 items-center gap-1 border-b border-border bg-sidebar px-1.5">
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="h-1 w-5 rounded-full bg-muted-foreground/40" />
      </div>
      <div className="flex min-h-0 flex-1 gap-1.5 p-1.5">
        <div className="w-3 shrink-0 rounded-sm bg-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="h-1.5 w-7 rounded-full bg-primary" />
          <div className="flex min-h-0 flex-1 items-end gap-0.5">
            {PREVIEW_BARS.map((height, index) => (
              <span
                key={index}
                style={{ height }}
                className={cn(
                  "flex-1 rounded-sm",
                  index % 2 === 0 ? "bg-download" : "bg-upload",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  option,
  selected,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        selected
          ? "border-primary"
          : "border-border hover:border-muted-foreground/40",
      )}
    >
      <ThemePreview theme={option.id} />
      <div className="flex items-start gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{option.label}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {option.description}
          </p>
        </div>
        <span
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent",
          )}
        >
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-5">
      {THEME_GROUPS.map((group) => (
        <section
          key={group.label}
          aria-label={group.label}
          className="flex flex-col gap-2"
        >
          <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.themes.map((option) => (
              <ThemeCard
                key={option.id}
                option={option}
                selected={theme === option.id}
                onSelect={() => setTheme(option.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}