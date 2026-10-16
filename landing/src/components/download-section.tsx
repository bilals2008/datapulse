import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RELEASES } from "@/lib/links";

const ICONS = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons";

type Platform = {
  name: string;
  detail: string;
  icon: string;
  invert: boolean;
};

const PLATFORMS: Platform[] = [
  {
    name: "Windows",
    detail: "Windows 10 & 11 · 64-bit",
    icon: `${ICONS}/windows/default.svg`,
    invert: false,
  },
  {
    name: "macOS",
    detail: "Apple silicon",
    icon: `${ICONS}/apple/mono.svg`,
    invert: true,
  },
  {
    name: "Linux",
    detail: "AppImage · deb · rpm",
    icon: `${ICONS}/linux/mono.svg`,
    invert: true,
  },
];

export function DownloadSection() {
  return (
    <section id="download" className="border-t border-border/70">
      <div className="mx-auto w-full max-w-5xl px-5 py-20 sm:py-24">
        <h2 className="font-heading text-center text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Download for your platform
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-pretty text-muted-foreground">
          Native builds for the three desktop OSes. Installed copies update
          themselves.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((platform) => {
            return (
              <div
                key={platform.name}
                className="flex flex-col items-center rounded-2xl border border-border bg-card/40 px-6 py-7 text-center transition-colors hover:border-primary/40"
              >
                <img
                  src={platform.icon}
                  alt=""
                  className={`size-8${platform.invert ? " dark:invert" : ""}`}
                />
                <h3 className="font-heading mt-4 text-base font-semibold tracking-tight">
                  {platform.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {platform.detail}
                </p>
                <Button size="lg" className="mt-6 w-full rounded-full text-sm" asChild>
                  <a href="#thanks">
                    <Download />
                    Download
                  </a>
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Another architecture or an older version?{" "}
          <a
            href={RELEASES}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Browse every release
          </a>
          .
        </p>
      </div>
    </section>
  );
}
