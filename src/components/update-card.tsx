import { Download, Loader2, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { usePoll } from "@/hooks/use-poll";
import { useSettings } from "@/hooks/use-settings";
import { useUpdater } from "@/hooks/use-updater";
import { api } from "@/lib/ipc";

const RELEASES_URL = "https://github.com/bilals2008/datapulse/releases";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function UpdateCard() {
  const { settings, update } = useSettings();
  const { data: meta } = usePoll(api.appMeta, 60000);
  const {
    status,
    version,
    notes,
    error,
    progress,
    checkForUpdates,
    install,
  } = useUpdater();

  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (status === "available" || status === "downloading" || status === "ready") {
      setRevealed(true);
    }
  }, [status]);

  const busy = status === "checking" || status === "downloading";

  const statusText = (() => {
    switch (status) {
      case "checking":
        return "Checking for updates…";
      case "available":
        return `Version ${version} is available.`;
      case "up-to-date":
        return "You're on the latest version.";
      case "downloading":
        return `Downloading… ${progress.percent}%`;
      case "ready":
        return "Update installed. Restarting…";
      case "error":
        return error ?? "Update check failed.";
      default:
        return "Check manually or let DataPulse check on startup.";
    }
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>
          DataPulse can check GitHub for new releases and install them in place.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="auto-update">Automatically check for updates</Label>
            <p className="text-xs text-muted-foreground">
              Runs a silent check once when the app starts.
            </p>
          </div>
          <Switch
            id="auto-update"
            checked={settings?.autoCheckUpdates ?? true}
            disabled={!settings}
            onCheckedChange={(checked) => {
              void update({ autoCheckUpdates: checked }).then(() =>
                toast.success(
                  checked
                    ? "Automatic update checks enabled"
                    : "Automatic update checks disabled",
                ),
              );
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void checkForUpdates()}
          >
            {status === "checking" ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            Check for updates
          </Button>

          {status === "available" ? (
            <Button size="sm" onClick={() => void install()}>
              <Download data-icon="inline-start" />
              Install {version}
            </Button>
          ) : null}

          <span className="text-xs text-muted-foreground">
            Current version {meta?.version ?? "—"}
          </span>
        </div>

        {status === "downloading" ? (
          <div className="flex flex-col gap-1.5">
            <Progress value={progress.percent} />
            <p className="text-xs text-muted-foreground">
              {formatBytes(progress.downloaded)}
              {progress.total > 0 ? ` of ${formatBytes(progress.total)}` : ""}
            </p>
          </div>
        ) : null}

        <p
          className={
            status === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {statusText}
        </p>

        {revealed && notes ? (
          <div className="rounded-md border border-border/70 bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium">What's new</p>
            <p
              data-selectable="true"
              className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground"
            >
              {notes}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void openUrl(RELEASES_URL)}
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          View all releases
        </button>
      </CardContent>
    </Card>
  );
}
