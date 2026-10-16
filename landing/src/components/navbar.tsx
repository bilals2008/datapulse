import { Download } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 py-2">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-3 rounded-full border border-border/70 bg-background/80 px-4 backdrop-blur-xl">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="size-6 rounded-md" />
          <span className="font-heading text-sm font-semibold tracking-tight">
            DataPulse
          </span>
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
