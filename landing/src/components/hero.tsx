import { Download } from "lucide-react";

import { ScreenshotPlaceholder } from "@/components/screenshot-placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { REPO } from "@/lib/links";

const SCREENSHOT_SRC: string | undefined = "/hero.png";

const ICONS = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons";

const OSES = [
  { name: "Windows", icon: `${ICONS}/windows/default.svg`, invert: false },
  { name: "macOS", icon: `${ICONS}/apple/mono.svg`, invert: true },
  { name: "Linux", icon: `${ICONS}/linux/mono.svg`, invert: true },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pt-12 pb-24 text-center sm:pt-16">
        <Badge
          variant="outline"
          className="h-auto gap-2 rounded-full bg-card/40 px-3 py-1.5 text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase backdrop-blur"
        >
          <span aria-hidden="true" className="text-primary">
            ✦
          </span>
          Open source · Local-first
        </Badge>

        <h1 className="font-heading mt-7 text-4xl leading-[1.1] font-normal tracking-tight text-balance sm:text-6xl">
          Every byte, in plain sight.
        </h1>

        <p className="mt-6 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
          A desktop monitor for network speed and data usage: live rates, history, and
          a monthly cap that warns you before you blow it.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="h-11 rounded-full px-6 text-sm" asChild>
            <a href="#thanks">
              <Download />
              Download for desktop
            </a>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full px-5 text-sm"
            asChild
          >
            <a href={REPO} target="_blank" rel="noreferrer">
              <img
                src={`${ICONS}/github/default.svg`}
                alt=""
                className="size-4 dark:invert"
              />
              GitHub
            </a>
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {OSES.map((os) => (
            <span key={os.name} className="flex items-center gap-1.5">
              <img
                src={os.icon}
                alt=""
                className={os.invert ? "size-3.5 dark:invert" : "size-3.5"}
              />
              {os.name}
            </span>
          ))}
        </div>

        <ScreenshotPlaceholder
          src={SCREENSHOT_SRC}
          alt="The DataPulse overview screen showing live throughput and data cap"
        />
      </div>
    </section>
  );
}
