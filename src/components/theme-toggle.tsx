import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex w-11 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring/60"
    >
      {isDark ? (
        <Moon className="size-3.5" strokeWidth={1.75} />
      ) : (
        <Sun className="size-3.5" strokeWidth={1.75} />
      )}
    </button>
  );
}