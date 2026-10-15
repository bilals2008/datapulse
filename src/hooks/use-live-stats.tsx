import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, type TickPayload } from "@/lib/ipc";

export type LivePoint = { rx: number; tx: number };

type LiveStatsContextValue = {
  latest: TickPayload | null;
  history: LivePoint[];
};

const WINDOW = 90;

const LiveStatsContext = createContext<LiveStatsContextValue>({
  latest: null,
  history: [],
});

export function LiveStatsProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<TickPayload | null>(null);
  const [history, setHistory] = useState<LivePoint[]>([]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    api
      .snapshot()
      .then((payload) => {
        if (active) setLatest(payload);
      })
      .catch(() => {});

    listen<TickPayload>("pulse-tick", (event) => {
      if (!active) return;
      const payload = event.payload;
      setLatest(payload);
      setHistory((prev) => [
        ...prev.slice(-(WINDOW - 1)),
        { rx: payload.rxRate, tx: payload.txRate },
      ]);
    }).then((dispose) => {
      if (active) {
        unlisten = dispose;
      } else {
        dispose();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return (
    <LiveStatsContext.Provider value={{ latest, history }}>
      {children}
    </LiveStatsContext.Provider>
  );
}

export function useLiveStats() {
  return useContext(LiveStatsContext);
}
