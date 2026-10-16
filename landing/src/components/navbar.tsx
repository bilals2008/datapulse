import { Download } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLatestRelease } from "@/lib/latest-release";
import { version as appVersion } from "../../package.json";

export function Navbar() {
  const release = useLatestRelease();
  const version = release?.tag_name?.replace(/^v/, "") ?? appVersion;

  return (
    <header className="sticky top-0 z-50 py-2">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-3 rounded-full border border-border/70 bg-background/80 px-4 backdrop-blur-xl">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-6 rounded-md" />
          <span className="font-heading text-sm font-semibold tracking-tight">
            DataPulse
          </span>
          <Badge
            variant="outline"
            className="h-auto px-2 py-0.5 text-[10px] tracking-wide text-muted-foreground"
          >
            v{version}
          </Badge>
        </a>

        <nav className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" className="ml-1" asChild>
            <a href="#thanks">
              <Download />
              Download
            </a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
