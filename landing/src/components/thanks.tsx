import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleCheckBig, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  fetchLatestRelease,
  type ReleaseAsset,
} from "@/lib/latest-release";
import { RELEASES } from "@/lib/links";

type UAArchData = {
  getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
};

const isArm = async () => {
  const uaData = (navigator as Navigator & { userAgentData?: UAArchData }).userAgentData;
  if (!uaData?.getHighEntropyValues) return false;

  try {
    const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
    return architecture === "arm";
  } catch {
    return false;
  }
};

function pickAsset(assets: ReleaseAsset[], arm: boolean): ReleaseAsset | undefined {
  const find = (test: (name: string) => boolean) =>
    assets.find((asset) => test(asset.name.toLowerCase()));
  const ua = navigator.userAgent;

  if (/Windows/i.test(ua)) {
    return (
      find((n) => n.endsWith("-setup.exe")) ??
      find((n) => n.endsWith(".exe")) ??
      find((n) => n.endsWith(".msi"))
    );
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    const token = arm ? "aarch64" : "x64";
    return (
      find((n) => n.endsWith(".dmg") && n.includes(token)) ??
      find((n) => n.endsWith(".dmg"))
    );
  }
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    const token = arm ? "aarch64" : "amd64";
    return (
      find((n) => n.endsWith(".appimage") && n.includes(token)) ??
      find((n) => n.endsWith(".appimage")) ??
      find((n) => n.endsWith(".deb") && n.includes(token))
    );
  }
  return undefined;
}

export function Thanks() {
  const [installer, setInstaller] = useState<ReleaseAsset>();
  const [status, setStatus] = useState<"loading" | "started" | "manual">("loading");
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const release = await fetchLatestRelease();
        const asset = pickAsset(release.assets ?? [], await isArm());
        if (cancelled) return;

        if (!asset) {
          setStatus("manual");
          return;
        }
        setInstaller(asset);
        setStatus("started");
      } catch {
        if (!cancelled) setStatus("manual");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!installer || started.current) return;
    started.current = true;

    const link = document.createElement("a");
    link.href = installer.browser_download_url;
    link.rel = "noreferrer";
    document.body.append(link);
    link.click();
    link.remove();
  }, [installer]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-5 py-20 text-center">
      <span
        aria-hidden="true"
        className="mt-2 grid size-14 place-items-center rounded-full border border-success/40 text-success"
      >
        <CircleCheckBig className="size-6" strokeWidth={1.75} />
      </span>

      <h1 className="font-heading mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Thanks for downloading DataPulse
      </h1>

      <p className="mt-4 text-sm text-pretty text-muted-foreground sm:text-base">
        {status === "loading" && "Finding the right installer for your system…"}
        {status === "started" &&
          "Your download has started. If nothing happened, use the button below."}
        {status === "manual" &&
          "We couldn't start the download automatically. Grab your installer below."}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {installer && (
          <Button size="lg" className="h-11 rounded-full px-6 text-sm" asChild>
            <a href={installer.browser_download_url} rel="noreferrer">
              <Download />
              Download again
            </a>
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          className="h-11 rounded-full px-5 text-sm"
          asChild
        >
          <a href={RELEASES} target="_blank" rel="noreferrer">
            All platforms &amp; versions
          </a>
        </Button>
      </div>

      {installer && (
        <p className="text-data mt-4 text-xs text-muted-foreground">
          {installer.name}
        </p>
      )}

      <a
        href="#/"
        className="mt-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to home
      </a>
    </main>
  );
}
