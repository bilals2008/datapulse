import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

import { useSettings } from "@/hooks/use-settings";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "error";

export type UpdateProgress = {
  downloaded: number;
  total: number;
  percent: number;
};

type UpdaterContextValue = {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  error: string | null;
  progress: UpdateProgress;
  checkForUpdates: (opts?: { silent?: boolean }) => Promise<void>;
  install: () => Promise<void>;
};

const UpdaterContext = createContext<UpdaterContextValue>({
  status: "idle",
  version: null,
  notes: null,
  error: null,
  progress: { downloaded: 0, total: 0, percent: 0 },
  checkForUpdates: async () => {},
  install: async () => {},
});

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>({
    downloaded: 0,
    total: 0,
    percent: 0,
  });

  const pending = useRef<Update | null>(null);
  const autoChecked = useRef(false);

  const checkForUpdates = useCallback(async (opts?: { silent?: boolean }) => {
    setStatus("checking");
    setError(null);
    try {
      const update = await check();
      if (update) {
        pending.current = update;
        setVersion(update.version);
        setNotes(update.body ?? null);
        setStatus("available");
        if (!opts?.silent) {
          toast.info(`DataPulse ${update.version} is available`);
        }
        return;
      }
      pending.current = null;
      setVersion(null);
      setNotes(null);
      setStatus("up-to-date");
      if (!opts?.silent) {
        toast.success("You're on the latest version");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts?.silent) {
        setStatus("idle");
        return;
      }
      setError(message);
      setStatus("error");
      toast.error("Update check failed");
    }
  }, []);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update) return;

    setStatus("downloading");
    setError(null);
    setProgress({ downloaded: 0, total: 0, percent: 0 });

    let total = 0;
    let downloaded = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            setProgress({ downloaded: 0, total, percent: 0 });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setProgress({
              downloaded,
              total,
              percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            });
            break;
          case "Finished":
            setProgress((prev) => ({ ...prev, percent: 100 }));
            break;
        }
      });
      setStatus("ready");
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
      toast.error("Could not install the update");
    }
  }, []);

  useEffect(() => {
    if (autoChecked.current) return;
    if (!settings || !settings.autoCheckUpdates) return;
    autoChecked.current = true;
    void checkForUpdates({ silent: true });
  }, [settings, checkForUpdates]);

  return (
    <UpdaterContext.Provider
      value={{ status, version, notes, error, progress, checkForUpdates, install }}
    >
      {children}
    </UpdaterContext.Provider>
  );
}

export function useUpdater() {
  return useContext(UpdaterContext);
}
